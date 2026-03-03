import * as vscode from 'vscode';
import { ProviderResolver } from './providers/ProviderResolver';
import { OnlineProvider } from './providers/OnlineProvider';
import { LocalProvider } from './providers/LocalProvider';
import { ChatViewProvider } from './providers/ChatViewProvider';
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

export function activate(context: vscode.ExtensionContext) {
    console.log('Orbit is active!');

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    const workspaceFolder = workspaceFolders[0].uri;

    const config = vscode.workspace.getConfiguration('orbit');
    const onlineEndpoint = config.get<string>('onlineApiEndpoint') || '';
    const onlineApiKey = config.get<string>('onlineApiKey') || '';
    const ollamaEndpoint = config.get<string>('ollamaEndpoint') || 'http://localhost:11434';
    const ollamaModel = config.get<string>('ollamaModel') || 'qwen2.5-coder:7b';

    const onlineProvider = new OnlineProvider(onlineEndpoint, onlineApiKey);
    const localProvider = new LocalProvider(ollamaEndpoint, ollamaModel);
    const resolver = new ProviderResolver(onlineProvider, localProvider);
    const ollamaClient = new OllamaClient(ollamaEndpoint);

    // Reasoning Infrastructure
    const formatter = new ResponseFormatter();
    const router = new LLMRouter(formatter, { maxRetries: 2, enforceFormat: true });

    // Memory System (Phase 2)
    const sqliteMemory = new SQLiteMemory(workspaceFolder.fsPath);
    sqliteMemory.initialize();
    const decisionJournal = new DecisionJournal(sqliteMemory);

    // Diff & Approval System (Phase 4)
    const diffEngine = new EnhancedDiffEngine(ollamaClient, router);
    const approvalManager = new ApprovalManager(decisionJournal);
    const diffApprovalView = new DiffApprovalView(context.extensionUri,
        (ids) => approvalManager.approve(ids),
        () => approvalManager.reject()
    );

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
    const reviewService = new EnhancedReviewService(ollamaClient, contextGatherer, reviewConfig, router);
    const presetManager = new PresetManager(context);
    const annotationManager = new AnnotationManager();
    const reviewCommand = new ReviewCommand(reviewService, presetManager);

    // UI Providers
    const codeLensProvider = new ReviewCodeLensProvider(annotationManager);
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider)
    );

    // Register Chat View
    const chatViewProvider = new ChatViewProvider(context.extensionUri, resolver);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatViewProvider)
    );

    // Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('orbit.chat', () => {
            vscode.commands.executeCommand('orbit.chatView.focus');
        }),
        vscode.commands.registerCommand('orbit.health', async () => {
            const health = await resolver.checkHealth();
            vscode.window.showInformationMessage(`Orbit Health: Online=${health.online}, Local=${health.local}`);
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
        })
    );
}

export function deactivate() { }
