import * as vscode from 'vscode';
import * as path from 'path';
import { ServiceLocator } from './ServiceLocator';
import { ChatProvider } from '../ChatProvider';
import { runEditCommand } from '../editCommand';
import { runAnalyzePerformance } from '../commands/analyzePerformance';
import { runViewDecisionHistory } from '../commands/viewDecisionHistory';
import { runSearch } from '../searchCommand';
import { buildIndex, updateFile } from '../indexer';

export class CommandRegistrar {
    private aiStatusItem: vscode.StatusBarItem;
    private pilotStatusBar?: vscode.StatusBarItem;

    constructor(private context: vscode.ExtensionContext, private services: ServiceLocator) {
        this.aiStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
        this.context.subscriptions.push(this.aiStatusItem);
    }

    public registerGlobalCommands() {
        // Register Webview
        this.context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(ChatProvider.viewType, this.services.chatProvider)
        );

        // Register Global Commands
        this.context.subscriptions.push(
            vscode.commands.registerCommand('orbit.chat', () => {
                vscode.commands.executeCommand('orbit.chatView.focus');
            }),
            vscode.commands.registerCommand('orbit.explain', async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showWarningMessage('Open a file to explain code.');
                    return;
                }
                const selection = editor.selection;
                const text = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
                const fileName = path.basename(editor.document.fileName);
                
                await this.services.chatProvider.handleExternalInstruction(`Explain this code from ${fileName}:\n\n\`\`\`\n${text}\n\`\`\``);
            }),
            vscode.commands.registerCommand('orbit.toggleMode', async () => {
                const config = vscode.workspace.getConfiguration('orbit');
                const current = config.get<string>('mode', 'cloud');
                const nextMode = current === 'offline' ? 'cloud' : 'offline';
                await config.update('mode', nextMode, vscode.ConfigurationTarget.Global);
                this.updateAIStatus();
                vscode.window.showInformationMessage(`Orbit: Switched to ${nextMode} mode`);
            }),
            vscode.commands.registerCommand('orbit.health', async () => {
                const health = await this.services.llmClient.checkConnection();
                vscode.window.showInformationMessage(`Orbit Health: ${health.message}`);
            })
        );

        // Status Bar Init
        this.updateAIStatus();

        // Listen for config changes
        this.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('orbit.mode')) {
                this.updateAIStatus();
            }
        }));
    }

    public registerWorkspaceCommands(workspaceFolder: vscode.Uri) {
        // Register CodeLens & Completion
        if (this.services.codeLensProvider) {
            this.context.subscriptions.push(
                vscode.languages.registerCodeLensProvider({ scheme: 'file' }, this.services.codeLensProvider)
            );
        }
        if (this.services.completionProvider) {
            this.context.subscriptions.push(
                vscode.languages.registerInlineCompletionItemProvider({ scheme: 'file' }, this.services.completionProvider)
            );
        }

        // Pilot Status Bar
        this.pilotStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.pilotStatusBar.command = 'orbit.pilot.toggle';
        this.pilotStatusBar.text = '$(pulse) Orbit: Pilot Active';
        this.pilotStatusBar.tooltip = 'Click to toggle Orbit Pilot (Background Analysis)';
        this.pilotStatusBar.show();
        this.context.subscriptions.push(this.pilotStatusBar);

        // Create output channel for performance
        const performanceOutputChannel = vscode.window.createOutputChannel('Orbit Performance');

        this.context.subscriptions.push(
            vscode.commands.registerCommand('orbit.review', () => this.services.reviewCommand?.execute()),
            vscode.commands.registerCommand('orbit.edit', () => runEditCommand(this.services.diffEngine!, this.services.approvalManager!, this.services.diffApprovalView!)),
            vscode.commands.registerCommand('orbit.search', () => runSearch(this.context)),
            vscode.commands.registerCommand('orbit.indexWorkspace', async () => {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Orbit: Indexing workspace for semantic search...',
                    cancellable: true
                }, async (_progress, token) => {
                    await buildIndex(workspaceFolder, token);
                });
                vscode.window.showInformationMessage('Orbit: Workspace index is ready.');
            }),
            vscode.commands.registerCommand('orbit.indexCurrentFile', async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    vscode.window.showWarningMessage('Open a file to update its Orbit index.');
                    return;
                }
                await updateFile(workspaceFolder, editor.document.uri);
                vscode.window.showInformationMessage(`Orbit: Indexed ${path.basename(editor.document.fileName)}.`);
            }),
            vscode.commands.registerCommand('orbit.showFindings', (findings) => {
                vscode.window.showInformationMessage(`Showing ${findings?.length || 0} local findings.`);
            }),
            vscode.commands.registerCommand('orbit.viewReasoning', (finding) => {
                if (finding?.reasoning) {
                    const md = this.services.formatter.renderMarkdown(finding.reasoning);
                    const panel = vscode.window.createWebviewPanel('orbitReasoning', 'AI Reasoning', vscode.ViewColumn.Beside, { enableScripts: true });
                    panel.webview.html = `<html><body><script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script><div id="content"></div><script>document.getElementById('content').innerHTML = marked.parse(\`${md.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`);</script></body></html>`;
                }
            }),
            vscode.commands.registerCommand('orbit.analyzePerformance', () => runAnalyzePerformance(this.services.performanceAnalyzer!, performanceOutputChannel)),
            vscode.commands.registerCommand('orbit.viewDecisionHistory', () => runViewDecisionHistory(this.services.decisionJournal!, this.services.historyView!)),
            vscode.commands.registerCommand('orbit.pilot.toggle', () => {
                const current = vscode.workspace.getConfiguration('orbit').get<boolean>('pilot.enabled', true);
                vscode.workspace.getConfiguration('orbit').update('pilot.enabled', !current, vscode.ConfigurationTarget.Global);
                if (this.pilotStatusBar) {
                    this.pilotStatusBar.text = !current ? '$(pulse) Orbit: Pilot Active' : '$(circle-slash) Orbit: Pilot Paused';
                }
                if (current) {
                    this.services.pilotAnalyzer?.clear();
                }
            }),
            vscode.commands.registerCommand('orbit.pilot.undo', () => this.services.autoFixEngine?.undoLastFix())
        );
    }

    private updateAIStatus() {
        const config = vscode.workspace.getConfiguration('orbit');
        const mode = config.get<string>('mode', 'cloud');
        this.aiStatusItem.text = mode !== 'offline' ? '$(cloud) Orbit: Online' : '$(device-desktop) Orbit: Local';
        this.aiStatusItem.tooltip = mode !== 'offline' ? 'Orbit is using the Online AI provider' : 'Orbit is using local offline models';
        this.aiStatusItem.show();
    }
}
