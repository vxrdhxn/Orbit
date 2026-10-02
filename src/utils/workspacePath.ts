import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

async function realpathIfExists(targetPath: string): Promise<string | null> {
    try {
        return await fs.promises.realpath(targetPath);
    } catch (error: any) {
        if (error?.code === 'ENOENT') {
            return null;
        }

        throw error;
    }
}

export async function resolveWorkspacePath(
    filePath: string = '.'
): Promise<string> {
    const workspaceRoot =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!workspaceRoot) {
        throw new Error('No workspace open');
    }

    if (typeof filePath !== 'string' || filePath.trim() === '') {
        throw new Error('A valid file path is required');
    }

    const resolvedRoot = path.resolve(workspaceRoot);
    const resolvedPath = path.resolve(resolvedRoot, filePath);

    const relativePath = path.relative(
        resolvedRoot,
        resolvedPath
    );

    if (
        relativePath === '..' ||
        relativePath.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativePath)
    ) {
        throw new Error(
            'Access denied: path is outside the workspace'
        );
    }

    const realRoot = await fs.promises.realpath(resolvedRoot);

    const realTarget = await realpathIfExists(resolvedPath);

    if (realTarget) {
        const realRelativePath = path.relative(
            realRoot,
            realTarget
        );

        if (
            realRelativePath === '..' ||
            realRelativePath.startsWith(`..${path.sep}`) ||
            path.isAbsolute(realRelativePath)
        ) {
            throw new Error(
                'Access denied: path resolves outside the workspace'
            );
        }

        return realTarget;
    }

    // The target does not exist yet.
    // Resolve the nearest existing parent so a symlinked
    // directory cannot escape the workspace.
    let existingParent = path.dirname(resolvedPath);
    const remainingParts: string[] = [];

    while (true) {
        const parentRealPath = await realpathIfExists(existingParent);

        if (parentRealPath) {
            const parentRelativePath = path.relative(
                realRoot,
                parentRealPath
            );

            if (
                parentRelativePath === '..' ||
                parentRelativePath.startsWith(`..${path.sep}`) ||
                path.isAbsolute(parentRelativePath)
            ) {
                throw new Error(
                    'Access denied: path resolves outside the workspace'
                );
            }

            const candidatePath = path.join(
                parentRealPath,
                ...remainingParts.reverse()
            );

            return candidatePath;
        }

        const parent = path.dirname(existingParent);

        if (parent === existingParent) {
            throw new Error(
                'Unable to resolve workspace path'
            );
        }

        remainingParts.push(path.basename(existingParent));
        existingParent = parent;
    }
}