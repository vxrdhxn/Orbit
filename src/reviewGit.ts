import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { ReviewScope } from './reviewTypes';

export interface DiffHunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[]; // Raw lines including + / - / space
    content: string; // The prompt-ready content
}

export interface FileDiff {
    fileName: string;
    hunks: DiffHunk[];
    status: 'modified' | 'added' | 'deleted' | 'renamed';
}

export class GitAnalyzer {
    constructor(private workspaceRoot: string) { }

    async getDiff(scope: ReviewScope): Promise<FileDiff[]> {
        let diffArgs: string[] = [];

        // Map scope to git args
        // ReviewScope doesn't perfectly map to git stages, so we might need new enum or interpretation.
        // Assuming we pass scope or distinct mode. 
        // For now, let's support:
        // - 'staged' -> git diff --cached
        // - 'working' -> git diff
        // - 'branch' -> git diff main...HEAD (or similar)

        // But ReviewScope in reviewTypes is 'Selection', 'CurrentFile', 'OpenFiles'.
        // We probably need to extend ReviewScope or handle "Review Changes" separately.
        // Let's assume we handle 'staged' and 'working' as distinct calls via a new method arg or interpreted scope.

        // Let's implement getting raw diff first.
        return [];
    }

    async getStagedChanges(): Promise<FileDiff[]> {
        const raw = await this.execGit(['diff', '--cached', '--unified=0', '--no-color']); // unified=0 to get just changes? No, we want context.
        // Actually, we want some context for the review, but usually git diff gives 3 lines.
        const diff = await this.execGit(['diff', '--cached', '--no-color']);
        return this.parseDiff(diff);
    }

    async getUnstagedChanges(): Promise<FileDiff[]> {
        const diff = await this.execGit(['diff', '--no-color']);
        return this.parseDiff(diff);
    }

    async getBranchChanges(baseBranch: string = 'main'): Promise<FileDiff[]> {
        // git diff base..HEAD
        const diff = await this.execGit(['diff', `${baseBranch}...HEAD`, '--no-color']);
        return this.parseDiff(diff);
    }

    private parseDiff(rawDiff: string): FileDiff[] {
        const files: FileDiff[] = [];
        let currentFile: FileDiff | null = null;
        let currentHunk: DiffHunk | null = null;

        const lines = rawDiff.split('\n');

        for (const line of lines) {
            if (line.startsWith('diff --git')) {
                // Start of new file
                if (currentFile && currentHunk) {
                    currentFile.hunks.push(currentHunk);
                    currentHunk = null;
                }
                if (currentFile) {
                    files.push(currentFile);
                }

                // Parse filename
                // diff --git a/src/foo.ts b/src/foo.ts
                const parts = line.split(' ');
                const bPath = parts[parts.length - 1];
                const fileName = bPath.startsWith('b/') ? bPath.substring(2) : bPath;

                currentFile = {
                    fileName,
                    hunks: [],
                    status: 'modified' // detecting add/delete requires checking /dev/null
                };
            } else if (line.startsWith('new file mode')) {
                if (currentFile) currentFile.status = 'added';
            } else if (line.startsWith('deleted file mode')) {
                if (currentFile) currentFile.status = 'deleted';
            } else if (line.startsWith('@@')) {
                // Hunk header
                // @@ -1,5 +1,6 @@
                if (currentFile && currentHunk) {
                    currentFile.hunks.push(currentHunk);
                }

                const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
                if (match) {
                    currentHunk = {
                        oldStart: parseInt(match[1]),
                        oldLines: parseInt(match[2] || '1'),
                        newStart: parseInt(match[3]),
                        newLines: parseInt(match[4] || '1'),
                        lines: [line],
                        content: line + '\n'
                    };
                }
            } else {
                if (currentHunk) {
                    currentHunk.lines.push(line);
                    currentHunk.content += line + '\n';
                }
            }
        }

        if (currentFile) {
            if (currentHunk) currentFile.hunks.push(currentHunk);
            files.push(currentFile);
        }

        return files;
    }

    async getFileContent(fileName: string, ref?: string): Promise<string> {
        // ref can be ':path' (index), 'HEAD:path' (commit), or undefined (fs - but prefer git for consistency if tracked)
        // If ref is provided, use git show.
        // If ref is undefined, read from info.

        if (ref) {
            return this.execGit(['show', `${ref}`]);
        } else {
            // Read from working directory using fs
            // Use VS Code fs? Or node fs. 
            // Since we use child_process for git, node fs is fine but we need absolute path.
            // However, if the file is untracked or ignoring git, fs is better.
            // Let's use fs for working tree.
            const fs = require('fs');
            const fullPath = path.join(this.workspaceRoot, fileName);
            return fs.promises.readFile(fullPath, 'utf8');
        }
    }

    private execGit(args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            cp.exec(`git ${args.join(' ')}`, { cwd: this.workspaceRoot, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
                if (err) {
                    // It's possible git fails if no repo.
                    reject(err);
                } else {
                    resolve(stdout);
                }
            });
        });
    }
}
