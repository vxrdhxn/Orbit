import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { RUNTIME_DIR, findPackageDir } from './runtimeResolve';

/** Packages Orbit installs on first use instead of shipping in the .vsix. */
export type RuntimePackage = 'node-llama-cpp' | '@huggingface/transformers';

const PACKAGE_INFO: Record<RuntimePackage, { feature: string; size: string }> = {
    'node-llama-cpp': { feature: 'offline AI mode', size: 'several hundred MB' },
    '@huggingface/transformers': { feature: 'local semantic search', size: 'about 100 MB' },
};

const NAME_PATTERN = /^(@[a-z0-9-]+\/)?[a-z0-9._-]+$/;
const RANGE_PATTERN = /^[\^~]?\d+\.\d+\.\d+$/;
const INSTALL_TIMEOUT_MS = 15 * 60 * 1000;

export interface InstallDeps {
    runtimeDir: string;
    /** Folders to search for an already-installed copy (dev checkout or bundled). */
    searchDirs: string[];
    /** Asks the user before downloading. Returns true to continue. */
    confirm(message: string): Promise<boolean>;
    /** Runs `npm install` in the given folder. */
    runNpmInstall(cwd: string, spec: string): Promise<void>;
    withProgress<T>(title: string, task: () => Promise<T>): Promise<T>;
}

const inflight = new Map<string, Promise<void>>();

/** Reads the version range for a package from Orbit's own package.json. */
export function readDependencyRange(name: string, startDir: string = __dirname): string {
    let dir = path.resolve(startDir);
    while (true) {
        const manifest = path.join(dir, 'package.json');
        if (fs.existsSync(manifest)) {
            const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
            const range = pkg.dependencies?.[name];
            if (typeof range === 'string') {
                return range;
            }
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    throw new Error(`Orbit's package.json does not declare a version for ${name}.`);
}

function runNpmInstall(cwd: string, spec: string): Promise<void> {
    // On Windows npm is npm.cmd, which Node can only start through a shell.
    // `spec` is validated against strict patterns before it gets here.
    const isWindows = process.platform === 'win32';

    return new Promise((resolve, reject) => {
        execFile(
            isWindows ? 'npm.cmd' : 'npm',
            ['install', spec, '--no-audit', '--no-fund', '--loglevel=error'],
            { cwd, timeout: INSTALL_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, shell: isWindows },
            (error, _stdout, stderr) => {
                if (!error) {
                    resolve();
                    return;
                }
                const detail = (stderr || error.message).trim().split('\n').slice(-5).join('\n');
                const missingNpm =
                    (error as any).code === 'ENOENT' ||
                    /not recognized|command not found/i.test(detail);
                reject(new Error(
                    missingNpm
                        ? 'npm was not found. Install Node.js (https://nodejs.org) and try again.'
                        : `npm install failed:\n${detail}`
                ));
            }
        );
    });
}

const defaultDeps: InstallDeps = {
    runtimeDir: RUNTIME_DIR,
    searchDirs: [__dirname],
    async confirm(message) {
        const choice = await vscode.window.showInformationMessage(
            message,
            { modal: true },
            'Install'
        );
        return choice === 'Install';
    },
    runNpmInstall,
    async withProgress(title, task) {
        return await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title, cancellable: false },
            task
        );
    },
};

async function install(name: RuntimePackage, deps: InstallDeps): Promise<void> {
    const range = readDependencyRange(name);

    if (!NAME_PATTERN.test(name) || !RANGE_PATTERN.test(range)) {
        throw new Error(`Refusing to install ${name}@${range}: unexpected package spec.`);
    }

    const info = PACKAGE_INFO[name];
    const approved = await deps.confirm(
        `Orbit needs to download ${name} (${info.size}) for ${info.feature}. ` +
        `It is installed once into ${deps.runtimeDir}. Requires Node.js (npm).`
    );
    if (!approved) {
        throw new Error(`${name} is required for ${info.feature} but was not installed.`);
    }

    fs.mkdirSync(deps.runtimeDir, { recursive: true });
    const manifest = path.join(deps.runtimeDir, 'package.json');
    if (!fs.existsSync(manifest)) {
        fs.writeFileSync(
            manifest,
            JSON.stringify({ name: 'orbit-runtime', private: true }, null, 2)
        );
    }

    await deps.withProgress(
        `Orbit: Installing ${name} for ${info.feature}... (this may take a few minutes)`,
        () => deps.runNpmInstall(deps.runtimeDir, `${name}@${range}`)
    );

    if (!findPackageDir(name, deps.searchDirs, deps.runtimeDir)) {
        throw new Error(`${name} was installed but could not be found in ${deps.runtimeDir}.`);
    }
}

/**
 * Makes sure a runtime package is available, installing it on first use.
 * Resolves immediately when it is already installed.
 */
export async function ensureRuntimePackage(
    name: RuntimePackage,
    deps: InstallDeps = defaultDeps
): Promise<void> {
    if (findPackageDir(name, deps.searchDirs, deps.runtimeDir)) {
        return;
    }

    let pending = inflight.get(name);
    if (!pending) {
        pending = install(name, deps).finally(() => inflight.delete(name));
        inflight.set(name, pending);
    }
    return pending;
}
