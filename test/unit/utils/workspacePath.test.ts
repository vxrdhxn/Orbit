import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { resolveWorkspacePath } from '../../../src/utils/workspacePath';

describe('resolveWorkspacePath security', () => {
    let workspaceRoot: string;
    let outsideRoot: string;

    beforeEach(() => {
        workspaceRoot = fs.mkdtempSync(
            path.join(os.tmpdir(), 'orbit-workspace-')
        );

        outsideRoot = fs.mkdtempSync(
            path.join(os.tmpdir(), 'orbit-outside-')
        );

        (vscode.workspace.workspaceFolders as any) = [
            {
                uri: {
                    fsPath: workspaceRoot,
                    scheme: 'file'
                }
            }
        ];
    });

    afterEach(() => {
        fs.rmSync(workspaceRoot, {
            recursive: true,
            force: true
        });

        fs.rmSync(outsideRoot, {
            recursive: true,
            force: true
        });
    });

    it('allows a normal workspace path', async () => {
        const target = path.join(workspaceRoot, 'src', 'example.ts');

        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, 'test');

        const result = await resolveWorkspacePath('src/example.ts');

        expect(result).toBe(path.resolve(target));
    });

    it('rejects lexical traversal outside the workspace', async () => {
        await expect(
            resolveWorkspacePath('../outside.txt')
        ).rejects.toThrow(
            'Access denied: path is outside the workspace'
        );
    });

    it('rejects an existing symlink pointing outside the workspace', async () => {
        const outsideDir = await fs.promises.mkdtemp(
            path.join(os.tmpdir(), 'orbit-outside-')
        );

        const outsideFile = path.join(outsideDir, 'secret.txt');
        await fs.promises.writeFile(outsideFile, 'secret');

        const link = path.join(workspaceRoot, 'secret-link.txt');

        try {
            await fs.promises.symlink(outsideFile, link, 'file');
        } catch (error: any) {
            if (
                process.platform === 'win32' &&
                (error?.code === 'EPERM' || error?.code === 'EACCES')
            ) {
                console.warn(
                    'Skipping symlink security test: Windows symlink permission is unavailable.'
                );
                return;
            }

            throw error;
        }

        await expect(
            resolveWorkspacePath(link)
        ).rejects.toThrow(
            'Access denied: path resolves outside the workspace'
        );
    });

    it('rejects a non-existent file beneath a symlinked directory', async () => {
        const outsideDirectory = path.join(
            outsideRoot,
            'secrets'
        );

        fs.mkdirSync(outsideDirectory);

        const link = path.join(
            workspaceRoot,
            'linked-secrets'
        );

        fs.symlinkSync(
            outsideDirectory,
            link,
            'junction'
        );

        await expect(
            resolveWorkspacePath(
                'linked-secrets/new-secret.txt'
            )
        ).rejects.toThrow(
            'Access denied: path resolves outside the workspace'
        );
    });
});