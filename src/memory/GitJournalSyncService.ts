import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { DecisionJournal } from './DecisionJournal';

const execAsync = require('util').promisify(exec);

export class GitJournalSyncService {
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private readonly syncFileName = 'journal.jsonl';
    private readonly legacySyncFileName = 'journal.json';
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
            const orbitDir = path.join(this.workspaceRoot, '.orbit');
            if (!fs.existsSync(orbitDir)) {
                fs.mkdirSync(orbitDir, { recursive: true });
            }
            
            const syncFilePath = path.join(orbitDir, this.syncFileName);

            if (vscode.workspace.getConfiguration('orbit').get<string>('sync.method') === 'git') {
                try {
                    await this.runGitCommand('status'); // Check if git is initialized

                    // 1. Fetch remote changes
                    try {
                        await this.runGitCommand('fetch origin');
                        const { stdout } = await this.runGitCommand(`show origin/HEAD:.orbit/${this.syncFileName}`);
                        if (stdout) {
                            const remoteRecords = stdout.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
                            this.journal.importDecisions(remoteRecords);
                        }
                    } catch (err) {
                        // Remote might not exist or branch might not be tracked
                    }

                    // 2. Export combined state from DB, sorted by timestamp
                    const decisions = this.journal.exportDecisions(projectId).sort((a, b) => a.timestamp - b.timestamp);
                    const fileContent = decisions.map(d => JSON.stringify(d)).join('\n');
                    fs.writeFileSync(syncFilePath, fileContent, 'utf8');

                    // 3. Stage and Commit
                    await this.runGitCommand(`add .orbit/${this.syncFileName}`);
                    try {
                        await this.runGitCommand(`commit -m "Orbit: Update team decision journal"`);
                    } catch (commitErr: any) {
                        // Might fail if nothing to commit, ignore
                    }

                    // 4. Pull and Push
                    try {
                        await this.runGitCommand('pull --rebase origin HEAD');
                    } catch (pullErr: any) {
                        try { await this.runGitCommand('rebase --abort'); } catch(e) {}
                        vscode.window.showWarningMessage('Orbit Sync: Merge conflict. Please manually pull and check the Git tab.');
                        return;
                    }

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
                const decisions = this.journal.exportDecisions(projectId).sort((a, b) => a.timestamp - b.timestamp);
                const fileContent = decisions.map(d => JSON.stringify(d)).join('\n');
                fs.writeFileSync(syncFilePath, fileContent, 'utf8');
                vscode.window.showInformationMessage(`Orbit: Exported ${decisions.length} decisions to .orbit/${this.syncFileName}`);
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
            // Also attempt to read legacy journal.json if present
            const legacyPath = syncFilePath.replace('.jsonl', '.json');
            let importedCount = 0;

            if (fs.existsSync(legacyPath)) {
                try {
                    const content = fs.readFileSync(legacyPath, 'utf8');
                    const records = JSON.parse(content) as any[];
                    if (Array.isArray(records)) {
                        importedCount += this.journal.importDecisions(records);
                    }
                } catch (e) {
                    console.error('Failed to read legacy journal.json', e);
                }
            }

            if (fs.existsSync(syncFilePath)) {
                const content = fs.readFileSync(syncFilePath, 'utf8');
                const records = content.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
                importedCount += this.journal.importDecisions(records);
            }

            if (manual || importedCount > 0) {
                vscode.window.showInformationMessage(`Orbit: Imported decisions from workspace journal.`);
            } else if (manual) {
                vscode.window.showInformationMessage(`Orbit: No journal found in workspace.`);
            }
        } catch (error) {
            console.error('Failed to import Orbit journal:', error);
            if (manual) { vscode.window.showErrorMessage('Orbit: Failed to import workspace journal. Check format.'); }
        }
    }
}
