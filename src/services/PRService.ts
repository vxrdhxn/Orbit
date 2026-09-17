import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class PRService {
    constructor(private workspaceRoot: string) {}

    /**
     * Checks if PR integration is enabled.
     */
    public isEnabled(): boolean {
        return vscode.workspace
            .getConfiguration('orbit')
            .get<boolean>('prIntegration.enabled', true);
    }

    /**
     * Gets the active Git branch name.
     */
    public async getActiveBranch(): Promise<string | null> {
        if (!this.workspaceRoot) {
            return null;
        }

        try {
            const { stdout } = await execFileAsync(
                'git',
                ['rev-parse', '--abbrev-ref', 'HEAD'],
                { cwd: this.workspaceRoot }
            );

            const branch = stdout.trim();

            return branch && branch !== 'HEAD'
                ? branch
                : null;
        } catch {
            return null;
        }
    }

    /**
     * Gets the active pull request using GitHub CLI.
     */
    public async getActivePRDetails(): Promise<{
        prUrl: string;
        title: string;
    } | null> {
        if (!this.isEnabled()) {
            return null;
        }

        const branch = await this.getActiveBranch();

        if (!branch) {
            return null;
        }

        try {
            const { stdout } = await execFileAsync(
                'gh',
                ['pr', 'view', '--json', 'url,title'],
                { cwd: this.workspaceRoot }
            );

            const prData = JSON.parse(stdout);

            if (
                typeof prData.url !== 'string' ||
                typeof prData.title !== 'string'
            ) {
                return null;
            }

            return {
                prUrl: prData.url,
                title: prData.title
            };
        } catch {
            return null;
        }
    }

    /**
     * Posts a comment to the active pull request.
     */
    public async postReviewComment(
        comment: string
    ): Promise<boolean> {
        if (!this.isEnabled() || !comment.trim()) {
            return false;
        }

        const pullRequest =
            await this.getActivePRDetails();

        if (!pullRequest) {
            return false;
        }

        try {
            await execFileAsync(
                'gh',
                ['pr', 'comment', '--body', comment],
                { cwd: this.workspaceRoot }
            );

            return true;
        } catch (error) {
            console.error(
                '[PRService] Failed to post PR comment:',
                error
            );

            return false;
        }
    }
}