import * as vscode from 'vscode';
import * as path from 'path';
import { SmartClient } from './providers/SmartClient';

import { ChatProvider } from './ChatProvider';
import { CompletionProvider } from './completionProvider';

import { ReviewService } from './reviewService';
import { EnhancedReviewService } from './services/EnhancedReviewService';
import { LLMRouter } from './reasoning/LLMRouter';
import { ResponseFormatter } from './reasoning/ResponseFormatter';
import { ContextGatherer } from './reviewContext';
import { AnnotationManager } from './reviewAnnotations';
import { ReviewCodeLensProvider } from './reviewCodeLens';
import { ReviewCommand } from './reviewCommand';
import { PresetManager } from './reviewPresets';
import { FindingCategory, SeverityLevel } from './reviewTypes';
import { OllamaClient } from './ollamaClient';

import { SimpleIndex } from './store';

import { SQLiteMemory } from './memory/SQLiteMemory';
import { DecisionJournal } from './memory/DecisionJournal';
import { EnhancedDiffEngine } from './services/EnhancedDiffEngine';
import { ApprovalManager } from './services/ApprovalManager';
import { DiffApprovalView } from './ui/DiffApprovalView';
import { runEditCommand } from './editCommand';
import { PerformanceAnalyzer } from './performance/PerformanceAnalyzer';
import { runAnalyzePerformance } from './commands/analyzePerformance';
import { EnhancedContextCollector } from './context/EnhancedContextCollector';
import { DecisionHistoryView } from './ui/DecisionHistoryView';
import { runViewDecisionHistory } from './commands/viewDecisionHistory';
import { BackgroundAnalyzer } from './services/BackgroundAnalyzer';
import { AutoFixEngine } from './services/AutoFixEngine';
import { JournalSyncService } from './memory/JournalSyncService';

export function activate(context: vscode.ExtensionContext) {
    try {
        console.log('Orbit is active!');

        // ============================================================
        // CRITICAL: Register the Chat View FIRST, unconditionally.
        // This must happen regardless of workspace state so the
        // sidebar panel always loads its UI.
        // ============================================================
        const llmClient = new SmartClient();
        const chatViewProvider = new ChatProvider(context, llmClient);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(ChatProvider.viewType, chatViewProvider)
        );


        // Register the chat focus command unconditionally too
        context.subscriptions.push(
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
                
                await chatViewProvider.handleExternalInstruction(`Explain this code from ${fileName}:\n\n\`\`\`\n${text}\n\`\`\``);
            })
        );

        // ============================================================
        // Workspace-dependent features below.
        // These gracefully skip if no folder is open.
        // ============================================================
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            console.log('Orbit: No workspace folders found. Chat is available, but advanced features (review, pilot, etc.) require an open folder.');
            return;
        }
        const workspaceFolder = workspaceFolders[0].uri;

        // All configurations are handled dynamically by SmartClient


        // Reasoning Infrastructure
        const formatter = new ResponseFormatter();
        const router = new LLMRouter(formatter, { maxRetries: 2, enforceFormat: true });

        // Memory System (Phase 2)
        const sqliteMemory = new SQLiteMemory(workspaceFolder.fsPath);
        sqliteMemory.initialize();
        const decisionJournal = new DecisionJournal(sqliteMemory);

        // Sync & Collaboration (Phase 12)
        const syncService = new JournalSyncService(decisionJournal, workspaceFolder.fsPath);
        syncService.activate(context.subscriptions);

        // Diff & Approval System (Phase 4)
        const diffEngine = new EnhancedDiffEngine(llmClient, router);

        const approvalManager = new ApprovalManager(decisionJournal);
        const diffApprovalView = new DiffApprovalView(context.extensionUri,
            (ids) => approvalManager.approve(ids),
            () => approvalManager.reject()
        );

        // Performance Analyzer (Phase 5)
        const performanceAnalyzer = new PerformanceAnalyzer(llmClient, router, formatter);

        const performanceOutputChannel = vscode.window.createOutputChannel('Orbit Performance');

        // Review System
        const index = new SimpleIndex(workspaceFolder);
        const contextGatherer = new ContextGatherer(index);
        const reviewConfig = {
            enabledCategories: [FindingCategory.Bug, FindingCategory.Security, FindingCategory.Performance],
            minSeverity: SeverityLevel.Info,
            includeContext: true,
            maxFindings: 20,
            autoApplyFixes: false
        };
        const reviewService = new EnhancedReviewService(llmClient, contextGatherer, reviewConfig, router);

        const presetManager = new PresetManager(context);
        const annotationManager = new AnnotationManager();
        const reviewCommand = new ReviewCommand(reviewService, presetManager);

        // Pilot Components (Phase 11)
        const autoFixEngine = new AutoFixEngine(decisionJournal);
        const pilotAnalyzer = new BackgroundAnalyzer(reviewService, autoFixEngine);
        pilotAnalyzer.activate(context.subscriptions);

        // UI Providers
        const contextCollector = new EnhancedContextCollector(decisionJournal, index);
        const historyView = new DecisionHistoryView(
            context.extensionUri,
            (path) => {
                // Handle navigation to file
                const uri = vscode.Uri.file(path);
                vscode.workspace.openTextDocument(uri).then(doc => {
                    vscode.window.showTextDocument(doc);
                });
            },
            (offset: number) => {
                const projectId = vscode.workspace.name || 'default-project';
                return decisionJournal.getRecentDecisions(projectId, 50, offset);
            }
        );
        const codeLensProvider = new ReviewCodeLensProvider(annotationManager);
        context.subscriptions.push(
            vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider),
            vscode.languages.registerInlineCompletionItemProvider({ scheme: 'file' }, new CompletionProvider(llmClient))
        );


        // Status Bar (Pilot)
        const pilotStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        pilotStatusBar.command = 'orbit.pilot.toggle';
        pilotStatusBar.text = '$(pulse) Orbit: Pilot Active';
        pilotStatusBar.tooltip = 'Click to toggle Orbit Pilot (Background Analysis)';
        pilotStatusBar.show();
        context.subscriptions.push(pilotStatusBar);

        // Workspace-dependent Commands
        context.subscriptions.push(
            vscode.commands.registerCommand('orbit.health', async () => {
                const health = await llmClient.checkConnection();
                vscode.window.showInformationMessage(`Orbit Health: ${health.message}`);
            }),

            vscode.commands.registerCommand('orbit.review', () => reviewCommand.execute()),
            vscode.commands.registerCommand('orbit.edit', () => runEditCommand(diffEngine, approvalManager, diffApprovalView)),
            vscode.commands.registerCommand('orbit.showFindings', (findings) => {
                vscode.window.showInformationMessage(`Showing ${findings?.length || 0} local findings.`);
            }),
            vscode.commands.registerCommand('orbit.viewReasoning', (finding) => {
                if (finding?.reasoning) {
                    const md = formatter.renderMarkdown(finding.reasoning);
                    const panel = vscode.window.createWebviewPanel('orbitReasoning', 'AI Reasoning', vscode.ViewColumn.Beside, { enableScripts: true });
                    panel.webview.html = `<html><body><script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script><div id="content"></div><script>document.getElementById('content').innerHTML = marked.parse(\`${md.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`);</script></body></html>`;
                }
            }),
            vscode.commands.registerCommand('orbit.analyzePerformance', () => runAnalyzePerformance(performanceAnalyzer, performanceOutputChannel)),
            vscode.commands.registerCommand('orbit.viewDecisionHistory', () => runViewDecisionHistory(decisionJournal, historyView)),

            // Pilot Commands
            vscode.commands.registerCommand('orbit.pilot.toggle', () => {
                const current = vscode.workspace.getConfiguration('orbit').get<boolean>('pilot.enabled', true);
                vscode.workspace.getConfiguration('orbit').update('pilot.enabled', !current, vscode.ConfigurationTarget.Global);
                pilotStatusBar.text = !current ? '$(pulse) Orbit: Pilot Active' : '$(circle-slash) Orbit: Pilot Paused';
                if (current) {
                    pilotAnalyzer.clear();
                }
            }),
            vscode.commands.registerCommand('orbit.pilot.undo', () => autoFixEngine.undoLastFix())
        );
    } catch (error) {
        console.error('Orbit activation failed:', error);
        vscode.window.showErrorMessage('Orbit failed to activate. Please check the Developer Tools console for details.');
    }
}

export function deactivate() { }
