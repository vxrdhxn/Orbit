import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DecisionJournal } from './DecisionJournal';

export class JournalSyncService {
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private readonly syncFileName = 'journal.json';

    constructor(
        private journal: DecisionJournal,
        private workspaceRoot: string
    ) {}

    public activate(subscriptions: { dispose(): any }[]) {
        const config = vscode.workspace.getConfiguration('orbit');
        
        // Setup file watcher for the journal.json file
        const orbitDir = path.join(this.workspaceRoot, '.orbit');
        const syncFilePath = path.join(orbitDir, this.syncFileName);

        if (config.get<boolean>('sync.enableWorkspaceSync', false)) {
            if (!fs.existsSync(orbitDir)) {
                fs.mkdirSync(orbitDir, { recursive: true });
            }

            const watchPattern = new vscode.RelativePattern(orbitDir, this.syncFileName);
            this.fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern);

            this.fileWatcher.onDidChange(() => this.importFromWorkspace(syncFilePath));
            this.fileWatcher.onDidCreate(() => this.importFromWorkspace(syncFilePath));

            subscriptions.push(this.fileWatcher);
        }

        // Register commands (always available so users can manually export without auto-sync on)
        subscriptions.push(
            vscode.commands.registerCommand('orbit.sync.export', () => this.exportToWorkspace()),
            vscode.commands.registerCommand('orbit.sync.import', () => this.importFromWorkspace(syncFilePath, true))
        );
    }

    public exportToWorkspace() {
        try {
            const projectId = vscode.workspace.name || 'default';
            // Only export decisions for the current project context
            const decisions = this.journal.exportDecisions(projectId);
            
            const orbitDir = path.join(this.workspaceRoot, '.orbit');
            if (!fs.existsSync(orbitDir)) {
                fs.mkdirSync(orbitDir, { recursive: true });
            }
            
            const syncFilePath = path.join(orbitDir, this.syncFileName);
            fs.writeFileSync(syncFilePath, JSON.stringify(decisions, null, 2), 'utf8');
            vscode.window.showInformationMessage(`Orbit: Exported ${decisions.length} decisions to .orbit/journal.json`);
        } catch (error) {
            console.error('Failed to export Orbit journal:', error);
            vscode.window.showErrorMessage('Orbit: Failed to export workspace journal.');
        }
    }

    public importFromWorkspace(syncFilePath: string, manual: boolean = false) {
        try {
            if (!fs.existsSync(syncFilePath)) {
                if (manual) vscode.window.showInformationMessage('Orbit: No journal.json found in workspace.');
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
            if (manual) vscode.window.showErrorMessage('Orbit: Failed to import workspace journal. Check format.');
        }
    }
}
