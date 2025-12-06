import * as vscode from 'vscode';
import { healthCheck, generate } from './ollamaClient';
import { buildIndex, updateFile } from './indexer';
import { runSearch } from './searchCommand';
import { runEditCommand, DiffContentProvider } from './editCommand';
import { ChatProvider } from './ChatProvider';
import { CompletionProvider } from './completionProvider';

export function activate(context: vscode.ExtensionContext) {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.text = '$(gear) AI: Init';
  status.tooltip = 'DevMind';
  status.show();
  context.subscriptions.push(status);

  async function runHealthCheck(showMsg = true) {
    status.text = '$(sync~spin) AI: Checking...';
    const res = await healthCheck();
    status.text = res.ok ? '$(check) AI: Local' : '$(warning) AI: Not Ready';
    if (showMsg) {
      (res.ok ? vscode.window.showInformationMessage : vscode.window.showWarningMessage)(res.message);
    }
  }

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('offlineDevAssistant.healthCheck', async () => runHealthCheck(true))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('offlineDevAssistant.explainSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return vscode.window.showWarningMessage('Open a file and select some code first.');
      const sel = editor.document.getText(editor.selection) || editor.document.getText();
      if (!sel.trim()) return vscode.window.showWarningMessage('No code selected or file is empty.');

      await runHealthCheck(false);
      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Explaining with local model…', cancellable: false },
        async () => {
          try {
            const prompt = [
              'You are an expert code explainer. In 6-10 concise bullet points, explain what this code does, key data flows, edge cases, and time/space complexity if applicable.',
              'Prefer short lines. Keep it strictly about the selected code.',
              'CODE:\n```',
              sel,
              '```'
            ].join('\n');
            const out = await generate(prompt);

            const doc = await vscode.workspace.openTextDocument({ content: out, language: 'markdown' });
            await vscode.window.showTextDocument(doc, { preview: false });
          } catch (e: any) {
            vscode.window.showErrorMessage(`Explain failed: ${e?.message ?? e}`);
          }
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('offlineDevAssistant.search', async () => {
      await runSearch(context);
    })
  );

  // NEW: minimal unified-diff edit
  context.subscriptions.push(
    vscode.commands.registerCommand('offlineDevAssistant.editCode', async () => {
      await runEditCommand();
    })
  );

  // NEW: Code Review
  context.subscriptions.push(
    vscode.commands.registerCommand('devmind.reviewCode', async () => {
      // dynamic import or just usage
      // We need to instantiate dependencies here or globally
      // For now, let's just do it here to avoid global pollution
      const ws = vscode.workspace.workspaceFolders?.[0];
      if (!ws) return vscode.window.showErrorMessage("Open a workspace first.");

      // Imports (we need to import these at top level)
      // Ensure imports are added to top of file
      const { ReviewCommand } = require('./reviewCommand');
      const { ReviewService } = require('./reviewService');
      const { ContextGatherer } = require('./reviewContext');
      const { OllamaClient } = require('./ollamaClient');
      const { SimpleIndex } = require('./store');
      const { PresetManager } = require('./reviewPresets');

      // This is a bit messy with requires, better to import at top. 
      // But for step replacement, this is safer if I don't want to touch top imports yet.
      // Actually, let's use the ReviewCommand logic which wraps everything if designed so
      // ReviewCommand takes ReviewService.

      const index = new SimpleIndex(ws.uri);
      const ollama = new OllamaClient(); // Use default config
      const contextGatherer = new ContextGatherer(index);
      const presetManager = new PresetManager(context);

      // Stub config for now or read from workspace
      const config = {
        enabledCategories: [],
        minSeverity: 'info',
        includeContext: true,
        maxFindings: 100,
        autoApplyFixes: false
      };

      const service = new ReviewService(ollama, contextGatherer, config);
      const cmd = new ReviewCommand(service, presetManager);
      await cmd.execute();
    })
  );

  // Chat View
  const chatProvider = new ChatProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatProvider.viewType, chatProvider)
  );

  // Register Chat View Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('devmind.newChat', () => chatProvider.clearChat()),
    vscode.commands.registerCommand('devmind.history', () => chatProvider.showHistory()),
    vscode.commands.registerCommand('devmind.customizations', () => chatProvider.handleHeaderOption('customizations')),
    vscode.commands.registerCommand('devmind.mcpServers', () => chatProvider.handleHeaderOption('mcpServers')),
    vscode.commands.registerCommand('devmind.downloadDiagnostics', () => chatProvider.handleHeaderOption('downloadDiagnostics')),
    vscode.commands.registerCommand('devmind.export', () => chatProvider.handleHeaderOption('export')),
    vscode.commands.registerCommand('devmind.closeView', () => vscode.commands.executeCommand('workbench.action.closeSidebar'))
  );

  // Diff Content Provider
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(DiffContentProvider.scheme, new DiffContentProvider())
  );

  // Inline Completion
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, new CompletionProvider())
  );

  // Background indexing on startup
  (async () => {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) return; // no workspace
    await runHealthCheck(false);

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'AI: Indexing workspace…', cancellable: true },
      async (_progress, token) => {
        try {
          await buildIndex(ws.uri, token); // pass CancellationToken
          status.text = '$(search) AI: Indexed';
          status.tooltip = 'Local semantic index ready';
        } catch (e: any) {
          if (token.isCancellationRequested) {
            status.text = '$(warning) AI: Index canceled';
          } else {
            status.text = '$(warning) AI: Index failed';
            vscode.window.showWarningMessage(`Indexing failed: ${e?.message ?? e}`);
          }
        }
      }
    );
  })();

  // Incremental indexing on file save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      const ws = vscode.workspace.workspaceFolders?.[0];
      if (!ws) return;
      try { await updateFile(ws.uri, doc.uri); } catch { /* ignore */ }
    })
  );
}

export function deactivate() { }
