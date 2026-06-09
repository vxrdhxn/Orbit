import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { DecisionJournal } from './DecisionJournal';

const execAsync = require('util').promisify(exec);

export class GitJournalSyncService {
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private readonly syncFileName = 'journal.json';
    private isSyncing = false;

    constructor(
        private journal: DecisionJournal,
        private workspaceRoot: string
    ) {}

    public activate(subscriptions: { dispose(): any }[]) {
        const config = vscode.workspace.getConfiguration('orbit');
        
        const orbitDir = path.join(this.workspaceRoot, '.orbit');
        const syncFilePath = path.join(orbitDir, this.syncFileName);

        if (config.get<string>('sync.method') === 'git' || config.get<boolean>('sync.enableWorkspaceSync', false)) {
            if (!fs.existsSync(orbitDir)) {
                fs.mkdirSync(orbitDir, { recursive: true });
            }

            const watchPattern = new vscode.RelativePattern(orbitDir, this.syncFileName);
            this.fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern);

            this.fileWatcher.onDidChange(() => this.importFromWorkspace(syncFilePath));
            this.fileWatcher.onDidCreate(() => this.importFromWorkspace(syncFilePath));

            subscriptions.push(this.fileWatcher);

            // Hook into git post-commit or periodically sync
            // For this MVP, we will sync on journal save/export.
        }

        subscriptions.push(
            vscode.commands.registerCommand('orbit.sync.export', () => this.exportAndSync()),
            vscode.commands.registerCommand('orbit.sync.import', () => this.importFromWorkspace(syncFilePath, true))
        );
    }

    private async runGitCommand(args: string): Promise<{ stdout: string, stderr: string }> {
        return execAsync(`git ${args}`, { cwd: this.workspaceRoot });
    }

    public async exportAndSync() {
        if (this.isSyncing) { return; }
        this.isSyncing = true;

        try {
            const projectId = vscode.workspace.name || 'default';
            const decisions = this.journal.exportDecisions(projectId);
            
            const orbitDir = path.join(this.workspaceRoot, '.orbit');
            if (!fs.existsSync(orbitDir)) {
                fs.mkdirSync(orbitDir, { recursive: true });
            }
            
            const syncFilePath = path.join(orbitDir, this.syncFileName);
            fs.writeFileSync(syncFilePath, JSON.stringify(decisions, null, 2), 'utf8');

            // Now perform Git Sync
            if (vscode.workspace.getConfiguration('orbit').get<string>('sync.method') === 'git') {
                try {
                    // Check if git is initialized
                    await this.runGitCommand('status');
                    
                    // Stage journal.json
                    await this.runGitCommand(`add .orbit/${this.syncFileName}`);
                    
                    // Commit
                    try {
                        await this.runGitCommand(`commit -m "Orbit: Update team decision journal"`);
                    } catch (commitErr: any) {
                        // Might fail if nothing to commit, ignore
                    }

                    // Try to pull and rebase to resolve conflicts
                    // If conflict happens, git will pause and user will see it in VS Code Git tab
                    try {
                        await this.runGitCommand('pull --rebase origin HEAD');
                    } catch (pullErr: any) {
                        vscode.window.showWarningMessage('Orbit Sync: Merge conflict or network error during pull. Please check the Git tab.');
                    }

                    // Try to push
                    try {
                        await this.runGitCommand('push origin HEAD');
                    } catch (pushErr: any) {
                        vscode.window.showWarningMessage('Orbit Sync: Could not push journal updates to remote.');
                    }

                    vscode.window.showInformationMessage(`Orbit: Synced ${decisions.length} decisions via Git.`);
                } catch (gitErr) {
                    console.error('Git sync failed:', gitErr);
                    vscode.window.showErrorMessage('Orbit: Git sync failed. Is this a git repository?');
                }
            } else {
                vscode.window.showInformationMessage(`Orbit: Exported ${decisions.length} decisions to .orbit/journal.json`);
            }
        } catch (error) {
            console.error('Failed to export Orbit journal:', error);
            vscode.window.showErrorMessage('Orbit: Failed to export workspace journal.');
        } finally {
            this.isSyncing = false;
        }
    }

    public importFromWorkspace(syncFilePath: string, manual: boolean = false) {
        try {
            if (!fs.existsSync(syncFilePath)) {
                if (manual) { vscode.window.showInformationMessage('Orbit: No journal.json found in workspace.'); }
                return;
            }

            const content = fs.readFileSync(syncFilePath, 'utf8');
            const records = JSON.parse(content) as any[];

            if (Array.isArray(records)) {
                const importedCount = this.journal.importDecisions(records);
                if (manual || importedCount > 0) {
                    vscode.window.showInformationMessage(`Orbit: Imported ${importedCount} decisions from workspace journal.`);
                }
            }
        } catch (error) {
            console.error('Failed to import Orbit journal:', error);
            if (manual) { vscode.window.showErrorMessage('Orbit: Failed to import workspace journal. Check format.'); }
        }
    }
}
