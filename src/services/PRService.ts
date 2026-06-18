import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class PRService {
    constructor(private workspaceRoot: string) {}

    /**
     * Checks if PR integration is enabled.
     */
    public isEnabled(): boolean {
        return vscode.workspace.getConfiguration('orbit').get<boolean>('prIntegration.enabled', true);
    }

    /**
     * Gets the active Git branch name.
     */
    public async getActiveBranch(): Promise<string | null> {
        if (!this.workspaceRoot) return null;
        try {
            const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: this.workspaceRoot });
            const branch = stdout.trim();
            return branch === 'HEAD' ? null : branch;
        } catch {
            return null;
        }
    }

    /**
     * Attempts to find an active PR for the current branch via GitHub CLI or API if possible.
     * This is a stub for full PR integration.
     */
    public async getActivePRDetails(): Promise<{ prUrl: string; title: string } | null> {
        if (!this.isEnabled()) return null;
        
        const branch = await this.getActiveBranch();
        if (!branch) return null;

        // In a full implementation, we could:
        // 1. Check if 'gh' CLI is installed: `gh pr view --json url,title`
        // 2. Or use the vscode.git API if the GitHub PR extension is installed.
        // For now, we return a mock structure if we detect a gh CLI.

        try {
            const { stdout } = await execAsync('gh pr view --json url,title', { cwd: this.workspaceRoot });
            const prData = JSON.parse(stdout);
            return {
                prUrl: prData.url,
                title: prData.title
            };
        } catch (e) {
            // gh cli not installed or no PR found
            return null;
        }
    }

    /**
     * Posts a comment to the active PR with the review findings.
     * Stub for future GitHub API / gh CLI implementation.
     */
    public async postReviewComment(comment: string): Promise<boolean> {
        if (!this.isEnabled()) return false;

        try {
            // Example using gh cli
            // await execAsync(`gh pr comment -b "${comment.replace(/"/g, '\\"')}"`, { cwd: this.workspaceRoot });
            return false; // Not fully implemented yet
        } catch (e) {
            console.error('Failed to post PR comment:', e);
            return false;
        }
    }
}
