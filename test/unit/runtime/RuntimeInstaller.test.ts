import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureRuntimePackage, readDependencyRange, InstallDeps } from '../../../src/runtime/RuntimeInstaller';

describe('RuntimeInstaller', () => {
    let tmp: string;
    let runtimeDir: string;
    let deps: InstallDeps;
    let confirm: jest.Mock;
    let runNpmInstall: jest.Mock;

    function fakeInstall(): void {
        const dir = path.join(runtimeDir, 'node_modules', 'node-llama-cpp');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"node-llama-cpp"}');
    }

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-installer-'));
        runtimeDir = path.join(tmp, 'runtime');
        confirm = jest.fn().mockResolvedValue(true);
        runNpmInstall = jest.fn().mockImplementation(async () => fakeInstall());
        deps = {
            runtimeDir,
            searchDirs: [path.join(tmp, 'nowhere')],
            confirm,
            runNpmInstall,
            withProgress: (_title, task) => task(),
        };
    });

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('reads the declared version range from Orbit package.json', () => {
        expect(readDependencyRange('node-llama-cpp')).toMatch(/^\^\d+\.\d+\.\d+$/);
        expect(() => readDependencyRange('not-a-dependency')).toThrow('does not declare');
    });

    it('does nothing when the package is already installed', async () => {
        fakeInstall();

        await ensureRuntimePackage('node-llama-cpp', deps);

        expect(confirm).not.toHaveBeenCalled();
        expect(runNpmInstall).not.toHaveBeenCalled();
    });

    it('asks, then installs the declared version into the runtime folder', async () => {
        await ensureRuntimePackage('node-llama-cpp', deps);

        expect(confirm).toHaveBeenCalledTimes(1);
        expect(runNpmInstall).toHaveBeenCalledWith(
            runtimeDir,
            `node-llama-cpp@${readDependencyRange('node-llama-cpp')}`
        );
        expect(fs.existsSync(path.join(runtimeDir, 'package.json'))).toBe(true);
    });

    it('does not install when the user declines', async () => {
        confirm.mockResolvedValue(false);

        await expect(ensureRuntimePackage('node-llama-cpp', deps)).rejects.toThrow('was not installed');

        expect(runNpmInstall).not.toHaveBeenCalled();
    });

    it('shares one install between concurrent callers', async () => {
        await Promise.all([
            ensureRuntimePackage('node-llama-cpp', deps),
            ensureRuntimePackage('node-llama-cpp', deps),
        ]);

        expect(runNpmInstall).toHaveBeenCalledTimes(1);
    });

    it('surfaces npm failures and allows a retry', async () => {
        runNpmInstall.mockRejectedValueOnce(new Error('npm was not found.'));

        await expect(ensureRuntimePackage('node-llama-cpp', deps)).rejects.toThrow('npm was not found');
        await ensureRuntimePackage('node-llama-cpp', deps);

        expect(runNpmInstall).toHaveBeenCalledTimes(2);
    });

    it('fails if npm succeeds but the package is still missing', async () => {
        runNpmInstall.mockResolvedValue(undefined);

        await expect(ensureRuntimePackage('node-llama-cpp', deps)).rejects.toThrow('could not be found');
    });
});
