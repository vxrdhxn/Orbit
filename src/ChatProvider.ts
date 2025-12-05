import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { generate, listModels } from './ollamaClient';
import { performSearch } from './searchCommand';

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  lastModified: number;
  messages: ChatMessage[];
}

export class ChatProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'offlineDevAssistant.chatView';
  private _abortController: AbortController | null = null;
  private _currentImage: string | null = null;
  private _webviewView: vscode.WebviewView | undefined;

  private _currentSession: ChatSession;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._currentSession = this._createNewSession();
  }

  private _createNewSession(): ChatSession {
    return {
      id: Date.now().toString(),
      title: 'New Chat',
      lastModified: Date.now(),
      messages: []
    };
  }

  private async _saveHistory() {
    const history = this._context.globalState.get<ChatSession[]>('chatHistory', []);
    const index = history.findIndex(s => s.id === this._currentSession.id);

    if (this._currentSession.messages.length > 0) {
      // Update title based on first message if it's "New Chat"
      if (this._currentSession.title === 'New Chat' && this._currentSession.messages.length > 0) {
        const firstMsg = this._currentSession.messages[0].content;
        this._currentSession.title = firstMsg.slice(0, 30) + (firstMsg.length > 30 ? '...' : '');
      }

      this._currentSession.lastModified = Date.now();

      if (index !== -1) {
        history[index] = this._currentSession;
      } else {
        history.unshift(this._currentSession);
      }
      await this._context.globalState.update('chatHistory', history);
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._context.extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Initial model list fetch
    this._sendModelList(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'refreshModels': {
          await this._sendModelList(webviewView.webview);
          break;
        }
        case 'webviewReady': {
          console.log('Received webviewReady, sending model list');
          await this._sendModelList(webviewView.webview);
          break;
        }
        case 'error': {
          vscode.window.showErrorMessage(data.value);
          break;
        }
        case 'changeModel': {
          const config = vscode.workspace.getConfiguration('offlineDevAssistant');
          await config.update('model', data.value, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage(`DevMind: Model changed to ${data.value}`);
          break;
        }
        case 'pullModel': {
          const modelName = data.value;
          if (!modelName) return;

          const terminal = vscode.window.createTerminal(`DevMind: Pull ${modelName}`);
          terminal.show();
          terminal.sendText(`ollama pull ${modelName}`);

          // Wait a bit and refresh list
          setTimeout(() => this._sendModelList(webviewView.webview), 5000);
          break;
        }
        case 'cancelGeneration': {
          if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
            webviewView.webview.postMessage({ type: 'status', value: 'Generation cancelled.' });
          }
          break;
        }
        case 'sendMessage': {
          const userMsg = data.value;
          console.log('Backend received sendMessage:', userMsg);

          // Add to current session
          this._currentSession.messages.push({
            role: 'user',
            content: userMsg,
            timestamp: Date.now()
          });
          this._saveHistory();

          // Cancel previous generation if any
          if (this._abortController) {
            this._abortController.abort();
          }
          this._abortController = new AbortController();

          // Send "thinking" status
          webviewView.webview.postMessage({ type: 'status', value: 'Thinking...' });

          try {
            // RAG: Search for context
            const ws = vscode.workspace.workspaceFolders?.[0];
            let contextText = '';
            if (ws) {
              try {
                // Check for file references in the message
                const fileRegex = /(\S+\.[a-zA-Z0-9]+)/g;
                const matches = userMsg.match(fileRegex);

                if (matches) {
                  for (const fileName of matches) {
                    const files = await vscode.workspace.findFiles(`**/${fileName}`, '**/node_modules/**', 1);
                    if (files.length > 0) {
                      const doc = await vscode.workspace.openTextDocument(files[0]);
                      contextText += `\n\nReferenced File: ${fileName}\n\`\`\`\n${doc.getText()}\n\`\`\``;
                    }
                  }
                }

                const results = await performSearch(userMsg, ws.uri);
                if (results.length > 0) {
                  contextText += "\n\nContext from codebase:\n" + results.map(r => `File: ${r.entry.file}\n${r.entry.text}`).join('\n\n');
                }
              } catch (e) {
                console.error('Search failed', e);
              }
            }

            // Add active editor content if available
            const editor = vscode.window.activeTextEditor;
            if (editor) {
              const doc = editor.document;
              const selection = editor.selection;
              const text = selection.isEmpty ? doc.getText() : doc.getText(selection);
              contextText += `\n\nActive File (${doc.fileName}):\n\`\`\`\n${text}\n\`\`\``;
            }

            const prompt = contextText ? `${contextText}\n\nUser Question: ${userMsg}` : userMsg;

            // Handle Image
            let images: string[] | undefined;
            if (this._currentImage) {
              try {
                const imagePath = this._currentImage;
                const imageBuffer = await vscode.workspace.fs.readFile(vscode.Uri.file(imagePath));
                const base64Image = Buffer.from(imageBuffer).toString('base64');
                images = [base64Image];
                // Clear image after use
                this._currentImage = null;
              } catch (e) {
                console.error('Failed to read image', e);
                webviewView.webview.postMessage({ type: 'addResponse', value: 'Error reading image file.' });
              }
            }

            // Streaming Response
            let aiResponse = '';
            await generate(prompt, (chunk) => {
              aiResponse += chunk;
              webviewView.webview.postMessage({ type: 'addResponseChunk', value: chunk });
            }, this._abortController.signal, images);

            // Save AI response to history
            this._currentSession.messages.push({
              role: 'ai',
              content: aiResponse,
              timestamp: Date.now()
            });
            this._saveHistory();

          } catch (e: any) {
            if (e.name === 'AbortError') {
              webviewView.webview.postMessage({ type: 'status', value: 'Cancelled' });
            } else {
              webviewView.webview.postMessage({ type: 'addResponse', value: `Error: ${e.message}` });
            }
          } finally {
            this._abortController = null;
            webviewView.webview.postMessage({ type: 'status', value: '' });
          }
          break;
        }
        case 'selectImage': {
          const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select Image',
            filters: {
              'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp']
            }
          };
          vscode.window.showOpenDialog(options).then(fileUri => {
            if (fileUri && fileUri[0]) {
              this._currentImage = fileUri[0].fsPath;
              webviewView.webview.postMessage({ type: 'imageSelected', value: fileUri[0].fsPath });
            }
          });
          break;
        }
        case 'insertCode': {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            editor.edit(editBuilder => {
              if (editor.selection.isEmpty) {
                editBuilder.insert(editor.selection.active, data.value);
              } else {
                editBuilder.replace(editor.selection, data.value);
              }
            });
          } else {
            vscode.window.showWarningMessage('Open a file to insert code.');
          }
          break;
        }
        case 'copyCode': {
          vscode.env.clipboard.writeText(data.value);
          vscode.window.showInformationMessage('Code copied to clipboard');
          break;
        }
        case 'newChat': {
          this.clearChat();
          break;
        }
        case 'openHistory': {
          this.showHistory();
          break;
        }
        case 'openSettings': {
          this.handleHeaderOption('customizations');
          break;
        }
      }
    });
  }

  // Public methods for external commands
  public clearChat() {
    this._saveHistory(); // Save before clearing
    this._currentSession = this._createNewSession();
    this._currentImage = null;
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this._webviewView?.webview.postMessage({ type: 'clearChat' });
  }

  public async showHistory() {
    const history = this._context.globalState.get<ChatSession[]>('chatHistory', []);
    if (history.length === 0) {
      vscode.window.showInformationMessage('No chat history found.');
      return;
    }

    const items = history.map(session => ({
      label: session.title,
      description: new Date(session.lastModified).toLocaleString(),
      session: session
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a previous chat session'
    });

    if (selected) {
      this._currentSession = selected.session;
      this._webviewView?.webview.postMessage({ type: 'loadChat', value: this._currentSession.messages });
    }
  }

  public async handleHeaderOption(opt: string) {
    if (opt === 'customizations') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'offlineDevAssistant');
    } else if (opt === 'mcpServers') {
      vscode.window.showInformationMessage('MCP Servers configuration coming soon!');
    } else if (opt === 'downloadDiagnostics') {
      const diagnostics = {
        version: vscode.extensions.getExtension('vxrdhxn.devmind')?.packageJSON.version,
        config: vscode.workspace.getConfiguration('offlineDevAssistant'),
      };
      const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(diagnostics, null, 2),
        language: 'json'
      });
      vscode.window.showTextDocument(doc);
    } else if (opt === 'export') {
      vscode.window.showInformationMessage('Export feature coming soon!');
    }
  }

  private async _sendModelList(webview: vscode.Webview) {
    console.log('[_sendModelList] called');
    try {
      const installedModels = await listModels();
      console.log('[_sendModelList] installedModels:', installedModels);
      const currentModel = vscode.workspace.getConfiguration('offlineDevAssistant').get<string>('model');

      const suggestedModels = ['deepseek-coder:6.7b', 'llama3', 'mistral', 'qwen2.5-coder:7b'];
      const allModels = [...installedModels];

      // Add suggested models if not present, marked as downloadable
      suggestedModels.forEach(m => {
        if (!installedModels.includes(m)) {
          allModels.push(`${m} (Download)`);
        }
      });

      console.log('[_sendModelList] sending updateModels message');
      webview.postMessage({ type: 'updateModels', value: { models: allModels, current: currentModel } });
    } catch (e: any) {
      console.error('Failed to list models', e);
      webview.postMessage({ type: 'modelListError', value: e.message || 'Unknown error' });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Local path to main script run in the webview
    const scriptPathOnDisk = vscode.Uri.joinPath(this._context.extensionUri, 'out', 'webview', 'index.js');
    const stylePathOnDisk = vscode.Uri.joinPath(this._context.extensionUri, 'out', 'webview', 'index.css');

    // And the uri we use to load this script in the webview
    const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
    const styleUri = webview.asWebviewUri(stylePathOnDisk);
    const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'codicon.css'));

    // Use a nonce to only allow specific scripts to be run
    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; font-src ${webview.cspSource};">
        <link href="${codiconsUri}" rel="stylesheet" />
        <link href="${styleUri}" rel="stylesheet" />
        <title>DevMind Chat</title>
      </head>
      <body>
        <div id="root"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
