import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generate, listModels } from './ollamaClient';
import { performSearch } from './searchCommand';
import { FileReferenceParser } from './fileReference/fileReferenceParser';
import { FileContentReader } from './fileReference/fileContentReader';
import { FileReferenceManager } from './fileReference/fileReferenceManager';
import { InlineApplyService } from './services/InlineApplyService';
import { TerminalService } from './services/TerminalService';
import { parseCodeBlocks, languageMatchesFile, isTerminalLanguage } from './utils/codeBlockParser';

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
  private _inlineApply: InlineApplyService;
  private _terminalService: TerminalService;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._currentSession = this._createNewSession();
    this._fileParser = new FileReferenceParser();
    this._fileReader = new FileContentReader();
    this._fileManager = new FileReferenceManager(_context);
    this._inlineApply = new InlineApplyService();
    this._terminalService = new TerminalService();
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

  /**
   * Handles instructions from outside the webview (e.g., from a VS Code command).
   */
  public async handleExternalInstruction(instruction: string) {
    if (!this._webviewView) {
      await vscode.commands.executeCommand('orbit.chatView.focus');
    }

    // Give it a moment to resolve if it was just opened
    if (!this._webviewView) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (this._webviewView) {
      // Sync UI first
      this._webviewView.webview.postMessage({ type: 'loadChat', value: this._currentSession.messages });
      // Clear status
      this._webviewView.webview.postMessage({ type: 'status', value: '' });

      // Then process
      await this._processMessage(instruction, this._webviewView.webview, true);
    }
  }

  private async _processMessage(userMsg: string, webview: vscode.Webview, appendToUI: boolean = false) {
    console.log('Processing message:', userMsg);

    if (appendToUI) {
      webview.postMessage({ type: 'addMessage', role: 'user', content: userMsg });
    }

    // Add to current session
    this._currentSession.messages.push({
      role: 'user',
      content: userMsg,
      timestamp: Date.now()
    });

    // Check for file references
    let fileContext = '';
    const detectedRefs = await this._fileParser.parse(userMsg);

    if (detectedRefs.length > 0) {
      for (const ref of detectedRefs) {
        if (ref.isValid) {
          try {
            const content = await this._fileReader.read(ref.path, {
              lineRange: ref.lineRange
            });
            fileContext += `\n\nReference: ${ref.raw}\nFile: ${ref.path}\n\`\`\`\n${content.content}\n\`\`\``;
            this._fileManager.addRecentFile(ref.path);
          } catch (e: any) {
            webview.postMessage({ type: 'addResponse', value: `Error reading ${ref.path}: ${e.message}` });
          }
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
    webview.postMessage({ type: 'status', value: 'Thinking...' });

    try {
      // RAG: Search for context
      const ws = vscode.workspace.workspaceFolders?.[0];
      let contextText = '';
      if (ws) {
        try {
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

      const systemPrompt = this._buildSystemPrompt(editor);
      const prompt = `${systemPrompt}\n\n${(contextText || fileContext) ? `${contextText}${fileContext}\n\n` : ''}User Question: ${userMsg}`;

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
          webview.postMessage({ type: 'addResponse', value: 'Error reading image file.' });
        }
      }

      // Streaming Response
      let aiResponse = '';
      await generate(prompt, (chunk) => {
        aiResponse += chunk;
        webview.postMessage({ type: 'addResponseChunk', value: chunk });
      }, this._abortController.signal, images);

      // Save AI response to history
      this._currentSession.messages.push({
        role: 'ai',
        content: aiResponse,
        timestamp: Date.now()
      });
      this._saveHistory();

      // Auto-Apply: detect code blocks and auto-open diff if a single block targets the active file
      this._tryAutoApply(aiResponse, webview);

    } catch (e: any) {
      if (e.name === 'AbortError') {
        webview.postMessage({ type: 'status', value: 'Cancelled' });
      } else {
        webview.postMessage({ type: 'addResponse', value: `Error: ${e.message}` });
      }
    } finally {
      this._abortController = null;
      webview.postMessage({ type: 'status', value: '' });
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
          await this._processMessage(userMsg, webviewView.webview);
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
        case 'applyCode': {
          const activeEditor = vscode.window.activeTextEditor;
          if (!activeEditor) {
            vscode.window.showWarningMessage('Orbit: Open a file first to apply code changes.');
            break;
          }

          const targetPath = activeEditor.document.uri.fsPath;
          const proposedCode = data.value;

          // If there's already a pending proposal, reject it first
          if (this._inlineApply.hasPendingProposal) {
            await this._inlineApply.reject();
          }

          webviewView.webview.postMessage({ type: 'status', value: 'Applying changes...' });

          try {
            const accepted = await this._inlineApply.proposeChange(targetPath, proposedCode);
            webviewView.webview.postMessage({
              type: 'addResponse',
              value: accepted
                ? '✅ Changes accepted and applied.'
                : '❌ Changes rejected — file restored.'
            });
          } catch (e: any) {
            webviewView.webview.postMessage({ type: 'addResponse', value: `Error applying code: ${e.message}` });
          } finally {
            webviewView.webview.postMessage({ type: 'status', value: '' });
          }
          break;
        }
        case 'runCommand': {
          const cmd = data.value;
          if (!cmd) break;

          webviewView.webview.postMessage({ type: 'status', value: 'Running command...' });

          try {
            const result = await this._terminalService.runWithConfirmation(cmd);
            if (result === null) {
              webviewView.webview.postMessage({ type: 'addResponse', value: '⚠️ Command cancelled by user.' });
            } else {
              let output = '';
              if (result.stdout) output += result.stdout;
              if (result.stderr) output += (output ? '\n' : '') + result.stderr;
              const exitLabel = result.exitCode === 0 ? '✅ Success' : `❌ Exit code: ${result.exitCode}`;
              webviewView.webview.postMessage({
                type: 'addResponse',
                value: `${exitLabel}\n\`\`\`\n${output || '(no output)'}\n\`\`\``
              });
            }
          } catch (e: any) {
            webviewView.webview.postMessage({ type: 'addResponse', value: `Error running command: ${e.message}` });
          } finally {
            webviewView.webview.postMessage({ type: 'status', value: '' });
          }
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
      let currentModel = config.get<string>('ollamaModel') || '';

      // Auto-sync: if the configured model isn't installed, switch to the first available one
      if (models.length > 0 && (!currentModel || !models.includes(currentModel))) {
        currentModel = models[0];
        await config.update('ollamaModel', currentModel, vscode.ConfigurationTarget.Global);
        console.log(`Orbit: Auto-selected model "${currentModel}" (previous model not found)`);
      }

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

  /**
   * Builds a system prompt that guides the AI to produce apply-ready code responses.
   */
  private _buildSystemPrompt(editor?: vscode.TextEditor): string {
    const parts = [
      'You are Orbit, an advanced AI coding assistant for VS Code.',
      '## Code Modification Rules',
      '- If the user asks for code, ALWAYS provide the FULL file content in one fenced block if possible.',
      '- Specify the language and optionally the file path: ```typescript:src/index.ts',
      '- Do not output partial snippets unless explicitly asked or for very large files.',
      '- After the code block, briefly summarize what was changed and why.',
      '',
      '## Terminal & Commands',
      '- For shell commands, use: ```bash',
      '- Terminal blocks will show a "Run" button in the UI.',
      '',
      '## Context Awareness',
      'You can see the current open file and any files the user explicitly references or attaches.',
    ];

    if (editor) {
      const fileName = path.basename(editor.document.fileName);
      const language = editor.document.languageId;
      parts.push(`The user is currently editing: ${fileName} (${language})`);
    }

    return parts.join('\n');
  }

  /**
   * After AI response completes, check if it contains a single code block
   * that matches the active file — if so, auto-open the diff view.
   */
  private async _tryAutoApply(aiResponse: string, webview: vscode.Webview) {
    try {
      const blocks = parseCodeBlocks(aiResponse);
      // Filter to non-terminal code blocks
      const codeBlocks = blocks.filter(b => !isTerminalLanguage(b.language));

      if (codeBlocks.length !== 1) return; // Only auto-apply for single code block responses

      const block = codeBlocks[0];
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const activeFile = editor.document.fileName;

      // Check if the block targets this file (by filepath annotation or language match)
      const matchesByPath = block.filePath && activeFile.endsWith(block.filePath.replace(/\//g, path.sep));
      const matchesByLang = !block.filePath && languageMatchesFile(block.language, activeFile);

      if (!matchesByPath && !matchesByLang) return;

      // Auto-apply: ask the user if they want to apply
      const choice = await vscode.window.showInformationMessage(
        `Orbit detected code changes for ${path.basename(activeFile)}. Apply them?`,
        'Apply & Review Diff',
        'Skip'
      );

      if (choice !== 'Apply & Review Diff') return;

      if (this._inlineApply.hasPendingProposal) {
        await this._inlineApply.reject();
      }

      const accepted = await this._inlineApply.proposeChange(activeFile, block.code);
      webview.postMessage({
        type: 'addResponse',
        value: accepted
          ? '✅ Changes accepted and applied.'
          : '❌ Changes rejected — file restored.'
      });
    } catch (e) {
      console.error('[ChatProvider] Auto-apply failed:', e);
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
