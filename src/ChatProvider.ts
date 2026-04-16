import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generate, listModels } from './ollamaClient';
import { performSearch } from './searchCommand';
import { FileReferenceParser } from './fileReference/fileReferenceParser';
import { FileContentReader } from './fileReference/fileContentReader';
import { FileReferenceManager } from './fileReference/fileReferenceManager';

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
  public static readonly viewType = 'orbit.chatView';
  private _abortController: AbortController | null = null;
  private _currentImage: string | null = null;
  private _webviewView: vscode.WebviewView | undefined;

  private _currentSession: ChatSession;
  private _fileParser: FileReferenceParser;
  private _fileReader: FileContentReader;
  private _fileManager: FileReferenceManager;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._currentSession = this._createNewSession();
    this._fileParser = new FileReferenceParser();
    this._fileReader = new FileContentReader();
    this._fileManager = new FileReferenceManager(_context);
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

  private _getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.png': return 'image/png';
      case '.jpg':
      case '.jpeg': return 'image/jpeg';
      case '.gif': return 'image/gif';
      case '.webp': return 'image/webp';
      default: return 'application/octet-stream';
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
          const config = vscode.workspace.getConfiguration('orbit');
          await config.update('ollamaModel', data.value, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage(`Orbit: Model changed to ${data.value}`);
          break;
        }
        case 'pullModel': {
          const modelName = data.value;
          if (!modelName) return;

          const terminal = vscode.window.createTerminal(`Orbit: Pull ${modelName}`);
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

          // Check for file references
          const ws = vscode.workspace.workspaceFolders?.[0];
          let fileContext = '';
          const detectedRefs = await this._fileParser.parse(userMsg);
          const validFiles: string[] = [];

          if (detectedRefs.length > 0) {
            for (const ref of detectedRefs) {
              if (ref.isValid) {
                try {
                  const content = await this._fileReader.read(ref.path, {
                    lineRange: ref.lineRange
                  });
                  fileContext += `\n\nReference: ${ref.raw}\nFile: ${ref.path}\n\`\`\`\n${content.content}\n\`\`\``;
                  validFiles.push(ref.path);
                  // Add to recent files
                  this._fileManager.addRecentFile(ref.path);
                } catch (e: any) {
                  webviewView.webview.postMessage({ type: 'addResponse', value: `Error reading ${ref.path}: ${e.message}` });
                }
              } else {
                webviewView.webview.postMessage({ type: 'addResponse', value: `Warning: File not found: ${ref.raw}` });
              }
            }
          }

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
                // Check for file references in the message - Legacy simple regex mostly replaced by new parser, but kept for fallback or specific cases?
                // Actually, let's remove the legacy simple regex if we trust our parser, 
                // OR process *other* context. 
                // The new parser handles explicit references. 

                // Let's rely on the new parser above for explicit file references.
                // We keep search for RAG.

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

            const prompt = (contextText || fileContext) ? `${contextText}${fileContext}\n\nUser Question: ${userMsg}` : userMsg;

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
          vscode.window.showOpenDialog(options).then(async fileUri => {
            if (fileUri && fileUri[0]) {
              this._currentImage = fileUri[0].fsPath;
              try {
                const imageBuffer = await vscode.workspace.fs.readFile(fileUri[0]);
                const base64 = Buffer.from(imageBuffer).toString('base64');
                const mimeType = this._getMimeType(fileUri[0].fsPath);
                webviewView.webview.postMessage({
                  type: 'imageSelected',
                  value: `data:${mimeType};base64,${base64}`
                });
              } catch (e) {
                console.error('Error reading image for preview:', e);
              }
            }
          });
          break;
        }
        case 'pasteImage': {
          try {
            const base64Data = data.value;
            if (!base64Data) return;

            const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
              return;
            }
            const base64Image = matches[2];
            const buffer = Buffer.from(base64Image, 'base64');

            const tempDir = os.tmpdir();
            const fileName = `devmind_pasted_${Date.now()}.png`;
            const filePath = path.join(tempDir, fileName);

            await fs.promises.writeFile(filePath, buffer);

            this._currentImage = filePath;
            // Send back the original data URI for preview
            webviewView.webview.postMessage({ type: 'imageSelected', value: base64Data });
          } catch (e: any) {
            console.error('Failed to save pasted image:', e);
            vscode.window.showErrorMessage('Failed to paste image');
          }
          break;
        }
        case 'clearImage': {
          this._currentImage = null;
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
        case 'openFilePicker': {
          const files = await this._fileManager.searchFiles(''); // list all/some files
          const recent = this._fileManager.getRecentFiles();

          // Create pick items
          const items: vscode.QuickPickItem[] = [];

          // Recent section
          if (recent.length > 0) {
            items.push({ label: 'Recent Files', kind: vscode.QuickPickItemKind.Separator });
            recent.forEach(f => items.push({
              label: path.basename(f.path),
              description: f.relativePath,
              detail: f.path
            }));
          }

          // All files section
          items.push({ label: 'All Files', kind: vscode.QuickPickItemKind.Separator });
          // We might want to avoid listing ALL files if too many. 
          // vscode.window.showQuickPick can take a Promise<string[]> but better to let user type.
          // But here we want to send back to webview? 
          // Requirement says "Chat Interface SHALL provide a button... to open a file picker".
          // If we rely on VS Code native picker, we can do it here.

          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a file to reference',
            matchOnDescription: true,
            matchOnDetail: true
          });

          if (selected && selected.detail) {
            // Insert into chat input via message
            // Ideally we send back "insertFileReference" message
            webviewView.webview.postMessage({
              type: 'insertFileReference',
              value: selected.detail
            });
          } else {
            // Maybe user wants to search by typing? 
            // showQuickPick allows typing. 
            // If we want FULL search, we might need a custom picker or use `vscode.workspace.findFiles`.
            // Let's stick to simple recent + picker for now.
          }
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
      placeHolder: 'Select a chat session to load'
    });

    if (selected) {
      this._currentSession = selected.session;
      this._currentImage = null; // Clear image when loading history
      this._webviewView?.webview.postMessage({ type: 'loadChat', value: this._currentSession.messages });
    }
  }

  public handleHeaderOption(option: string) {
    switch (option) {
      case 'customizations':
        vscode.commands.executeCommand('workbench.action.openSettings', 'Orbit');
        break;
    }
  }

  private async _sendModelList(webview: vscode.Webview) {
    try {
      const models = await listModels();
      const config = vscode.workspace.getConfiguration('orbit');
      const currentModel = config.get<string>('ollamaModel') || (models.length > 0 ? models[0] : '');

      webview.postMessage({
        type: 'updateModels',
        value: {
          models: models,
          current: currentModel
        }
      });
    } catch (e: any) {
      // Just send empty list or error state
      webview.postMessage({ type: 'modelListError', value: e.message });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const uiDistPath = path.join(this._context.extensionUri.fsPath, 'out', 'webview');
    const htmlPath = path.join(uiDistPath, 'index.html');

    let html = '';
    try {
      html = fs.readFileSync(htmlPath, 'utf8');
    } catch (err) {
      return `<html><body><h1>Error loading UI</h1><p>${err}</p></body></html>`;
    }

    const baseUri = webview.asWebviewUri(vscode.Uri.file(uiDistPath));
    const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'codicon.css'));
    const codiconFontUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'codicon.ttf'));

    // Relax CSP to allow Vite modules to load correctly
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-eval'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data: https:; connect-src ${webview.cspSource} https:;`;

    // Patch the HTML
    // 1. Inject CSP
    html = html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`);
    
    // 2. Inject codicons - override @font-face with correct webview URI for the .ttf font,
    //    then load the CSS for icon class definitions
    html = html.replace('</head>', `<style>@font-face { font-family: "codicon"; font-display: block; src: url("${codiconFontUri}") format("truetype"); }</style><link href="${codiconsUri}" rel="stylesheet"></head>`);

    // 3. Convert root-relative paths to webview URIs
    // Matches src="/index.js" or href="/index.css"
    html = html.replace(
      /(src|href)="(?:\.\/|\/)?([^"]+)"/g,
      (match, attr, filePath) => {
        if (filePath.startsWith('http') || filePath.startsWith('data:')) return match;
        return `${attr}="${baseUri}/${filePath}"`;
      }
    );

    return html;
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
