import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { findPackageDir, getPackageEntry, resolvePackageEntryUrl } from '../../../src/runtime/runtimeResolve';

function writePackage(root: string, name: string, manifest: object): string {
    const dir = path.join(root, 'node_modules', name);
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, ...manifest }));
    fs.writeFileSync(path.join(dir, 'dist', 'index.js'), '');
    return dir;
}

describe('runtimeResolve', () => {
    let tmp: string;

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-runtime-'));
    });

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('finds a package in the runtime folder', () => {
        const runtime = path.join(tmp, 'runtime');
        const dir = writePackage(runtime, 'demo-pkg', { main: './dist/index.js' });

        expect(findPackageDir('demo-pkg', [], runtime)).toBe(dir);
    });

    it('walks up from a start folder like Node module resolution', () => {
        const dir = writePackage(tmp, 'demo-pkg', { main: './dist/index.js' });
        const nested = path.join(tmp, 'a', 'b');
        fs.mkdirSync(nested, { recursive: true });

        expect(findPackageDir('demo-pkg', [nested], path.join(tmp, 'none'))).toBe(dir);
    });

    it('prefers the runtime folder over a walked-up copy', () => {
        writePackage(tmp, 'demo-pkg', { main: './dist/index.js' });
        const runtime = path.join(tmp, 'runtime');
        const runtimeDir = writePackage(runtime, 'demo-pkg', { main: './dist/index.js' });

        expect(findPackageDir('demo-pkg', [tmp], runtime)).toBe(runtimeDir);
    });

    it('returns null when the package is not installed', () => {
        expect(findPackageDir('missing-pkg', [tmp], path.join(tmp, 'none'))).toBeNull();
        expect(resolvePackageEntryUrl('missing-pkg', [tmp], path.join(tmp, 'none'))).toBeNull();
    });

    it('resolves an ESM-only package through its exports map', () => {
        const dir = writePackage(tmp, 'esm-pkg', {
            type: 'module',
            exports: { import: './dist/index.js', types: './dist/index.d.ts' },
        });

        expect(getPackageEntry(dir)).toBe(path.join(dir, 'dist', 'index.js'));
    });

    it('resolves a nested "." export and falls back to main', () => {
        const nested = writePackage(tmp, 'nested-pkg', {
            exports: { '.': { node: { import: './dist/index.js' } } },
        });
        const legacy = writePackage(tmp, 'legacy-pkg', { main: './dist/index.js' });

        expect(getPackageEntry(nested)).toBe(path.join(nested, 'dist', 'index.js'));
        expect(getPackageEntry(legacy)).toBe(path.join(legacy, 'dist', 'index.js'));
    });

    it('returns a file URL for the entry', () => {
        const runtime = path.join(tmp, 'runtime');
        const dir = writePackage(runtime, 'esm-pkg', { exports: { import: './dist/index.js' } });

        expect(resolvePackageEntryUrl('esm-pkg', [], runtime)).toBe(
            pathToFileURL(path.join(dir, 'dist', 'index.js')).href
        );
    });
});
