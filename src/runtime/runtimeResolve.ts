import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

/**
 * Packages that are too large or too platform-specific to ship inside the
 * .vsix (node-llama-cpp and its native binaries, the embeddings stack) are
 * installed on first use into this folder.
 *
 * This file must not import `vscode`: it is also bundled into the workers.
 */
export const RUNTIME_DIR = path.join(os.homedir(), '.orbit', 'runtime');

/**
 * Finds the folder of an installed package.
 * Looks in the runtime folder first, then walks up from each start folder the
 * way Node resolves modules (this covers a development checkout and a
 * package that was bundled inside the extension).
 */
export function findPackageDir(
    name: string,
    startDirs: string[] = [],
    runtimeDir: string = RUNTIME_DIR
): string | null {
    const candidates = [path.join(runtimeDir, 'node_modules', name)];

    for (const start of startDirs) {
        let dir = path.resolve(start);
        while (true) {
            candidates.push(path.join(dir, 'node_modules', name));
            const parent = path.dirname(dir);
            if (parent === dir) {
                break;
            }
            dir = parent;
        }
    }

    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, 'package.json'))) {
            return candidate;
        }
    }
    return null;
}

function pickExportTarget(target: any): string | null {
    if (typeof target === 'string') {
        return target;
    }
    if (target && typeof target === 'object') {
        for (const condition of ['import', 'node', 'default']) {
            const picked = pickExportTarget(target[condition]);
            if (picked) {
                return picked;
            }
        }
    }
    return null;
}

/** Returns the absolute path of a package's main entry file. */
export function getPackageEntry(packageDir: string): string {
    const pkg = JSON.parse(
        fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')
    );

    const exportsField = pkg.exports;
    const rootExport =
        exportsField && typeof exportsField === 'object' && '.' in exportsField
            ? exportsField['.']
            : exportsField;

    const relative =
        pickExportTarget(rootExport) ||
        pkg.module ||
        pkg.main ||
        'index.js';

    return path.resolve(packageDir, relative);
}

/**
 * Returns a file:// URL that can be passed to a native `import()`, or null if
 * the package is not installed anywhere Orbit can find it.
 */
export function resolvePackageEntryUrl(
    name: string,
    startDirs: string[] = [],
    runtimeDir: string = RUNTIME_DIR
): string | null {
    const packageDir = findPackageDir(name, startDirs, runtimeDir);
    if (!packageDir) {
        return null;
    }
    return pathToFileURL(getPackageEntry(packageDir)).href;
}
