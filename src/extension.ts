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
