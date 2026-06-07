import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ILLMClient } from './providers/ILLMClient';

import { performSearch } from './searchCommand';

import { FileReferenceParser } from './fileReference/fileReferenceParser';
import { FileContentReader } from './fileReference/fileContentReader';
import { FileReferenceManager } from './fileReference/fileReferenceManager';
import { ToolManager } from './tools/ToolManager';
import { InlineApplyService } from './services/InlineApplyService';
import { TerminalService } from './services/TerminalService';
import { parseCodeBlocks, languageMatchesFile, isTerminalLanguage } from './utils/codeBlockParser';
import { LLMRouter } from './reasoning/LLMRouter';
import { StructuredResponse } from './reasoning/types';

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
  structuredReasoning?: StructuredResponse;
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

  private _toolManager: ToolManager;
  private _maxIterations = 5;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _llmClient: ILLMClient,
    private readonly _llmRouter?: LLMRouter
  ) {

    this._currentSession = this._createNewSession();
    this._fileParser = new FileReferenceParser();
    this._fileReader = new FileContentReader();
    this._fileManager = new FileReferenceManager(_context);
    this._inlineApply = new InlineApplyService();
    this._terminalService = new TerminalService();
    this._toolManager = new ToolManager(this._terminalService, this._inlineApply);
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

  public async handleExternalInstruction(instruction: string) {
    if (!this._webviewView) {
      await vscode.commands.executeCommand('orbit.chatView.focus');
    }

    if (!this._webviewView) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (this._webviewView) {
      this._webviewView.webview.postMessage({ type: 'loadChat', value: this._currentSession.messages });
      this._webviewView.webview.postMessage({ type: 'status', value: '' });
      await this._processMessage(instruction, this._webviewView.webview, true);
    }
  }

  private async _processMessage(userMsg: string, webview: vscode.Webview, appendToUI: boolean = false) {
    console.log('Processing message (Agentic Loop):', userMsg);

    if (appendToUI) {
      webview.postMessage({ type: 'addMessage', role: 'user', content: userMsg });
    }

    // Add to current session
    this._currentSession.messages.push({ role: 'user', content: userMsg, timestamp: Date.now() });

    webview.postMessage({ type: 'status', value: 'Initializing...' });
    console.log('0. Performing connection check...');

    // 0. Proactive connection check
    const status = await this._llmClient.checkConnection();
    console.log('Connection check result:', status);
    webview.postMessage({ type: 'updateConnectionState', value: status });
    
    if (!status.ok) {
        console.warn('Connection failed:', status.message);
        const errorMessage = `⚠️ **Connection Error**: ${status.message}`;
        webview.postMessage({ type: 'addResponse', value: errorMessage });
        
        // Save to session history so it doesn't disappear on refresh
        this._currentSession.messages.push({ role: 'ai', content: errorMessage, timestamp: Date.now() });
        this._saveHistory();
        webview.postMessage({ type: 'status', value: '' });
        return;
    }

    if (this._abortController) {this._abortController.abort();}
    this._abortController = new AbortController();

    let iteration = 0;
    let fullPrompt = await this._buildInitialPrompt(userMsg);
    const images = await this._getCurrentImagePayload();
    let finalCombinedResponse = '';

    while (iteration < this._maxIterations) {
        iteration++;
        const statusVal = iteration === 1 ? 'Reasoning...' : `Executing Step ${iteration}...`;
        console.log(`Agent Loop Iteration ${iteration}: ${statusVal}`);
        webview.postMessage({ type: 'status', value: statusVal });

        try {
            let currentTurnResponse = '';
            console.log('Starting stream generation...');
            await this._llmClient.generateStream(fullPrompt, (chunk) => {
                if (chunk == null) {return;} // Guard: skip undefined/null chunks
                currentTurnResponse += chunk;
                webview.postMessage({ type: 'addResponseChunk', value: chunk });
            }, this._abortController.signal, images);
            
            console.log('Stream generation completed. Length:', currentTurnResponse.length);


            // Check for tool calls
            const toolCallMatch = currentTurnResponse.match(/<tool_call name="([^"]+)">([\s\S]*?)<\/tool_call>/);
            
            if (toolCallMatch) {
                const toolName = toolCallMatch[1];
                let toolArgs = {};
                try {
                    toolArgs = JSON.parse(toolCallMatch[2].trim());
                } catch (e) {
                    console.error('Failed to parse tool args', e);
                }

                // UI notification
                webview.postMessage({ type: 'status', value: `Calling ${toolName}...` });
                
                const result = await this._toolManager.callTool(toolName, toolArgs);
                const observation = `\n<observation>\n${result.output}\n</observation>\n`;
                
                // Append to prompt for next iteration
                fullPrompt += currentTurnResponse + observation;
                finalCombinedResponse += currentTurnResponse + observation;
            } else {
                // No more tool calls, we are done
                finalCombinedResponse += currentTurnResponse;
                break;
            }
        } catch (e: any) {
            if (e.name === 'AbortError') {
                webview.postMessage({ type: 'status', value: 'Cancelled' });
            } else {
                const errorMsg = `\n\n⚠️ **Error**: ${e.message}`;
                webview.postMessage({ type: 'addResponseChunk', value: errorMsg });
                finalCombinedResponse += errorMsg;
            }
            break;
        }
    }

    // Save final state
    let structuredReasoning;
    if (this._llmRouter) {
        const parsed = this._llmRouter.transformResponse(finalCombinedResponse);
        if (parsed) {
            structuredReasoning = parsed;
        }
    }

    this._currentSession.messages.push({ 
        role: 'ai', 
        content: finalCombinedResponse, 
        timestamp: Date.now(),
        structuredReasoning
    });
    this._saveHistory();
    this._abortController = null;
    this._currentImage = null;
    webview.postMessage({ type: 'status', value: '' });
    // Update UI with the final structured reasoning if available
    webview.postMessage({ type: 'loadChat', value: this._currentSession.messages });

    // Final Auto-Apply check
    this._tryAutoApply(finalCombinedResponse, webview);
  }

  private async _buildInitialPrompt(userMsg: string): Promise<string> {
    const editor = vscode.window.activeTextEditor;
    const systemPrompt = this._buildSystemPrompt(editor);
    const toolInstructions = this._toolManager.getToolDefinitions();
    const context = await this._buildFileContext(userMsg, editor);
    
    // Include past conversation history within this session
    const history = this._currentSession.messages.slice(0, -1).map(m =>
        `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
    ).join('\n\n');
    
    let finalPrompt = `${systemPrompt}\n\n${toolInstructions}\n\n${context}\n\nConversation History:\n${history || '(No previous messages)'}\n\nUser Question: ${userMsg}\n\nResponse:`;
    if (this._llmRouter) {
        finalPrompt = this._llmRouter.appendStructuredInstructions(finalPrompt);
    }
    return finalPrompt;
  }

  private async _buildFileContext(userMsg: string, editor?: vscode.TextEditor): Promise<string> {
    const sections: string[] = ['Workspace Context:'];

    if (editor) {
      const selection = editor.selection;
      const selectedText = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
      const truncated = selectedText.length > 12000
        ? `${selectedText.slice(0, 12000)}\n... [TRUNCATED]`
        : selectedText;
      sections.push(`Active file: ${editor.document.fileName}\n\`\`\`${editor.document.languageId}\n${truncated}\n\`\`\``);
    }

    const references = await this._fileParser.parse(userMsg);
    const seen = new Set<string>();
    for (const reference of references) {
      if (!reference.isValid || seen.has(reference.path)) {
        continue;
      }

      seen.add(reference.path);
      this._fileManager.addRecentFile(reference.path);
      try {
        const file = await this._fileReader.read(reference.path, {
          lineRange: reference.lineRange
        });
        const truncated = file.content.length > 12000
          ? `${file.content.slice(0, 12000)}\n... [TRUNCATED]`
          : file.content;
        sections.push(`Referenced file: ${reference.path}\n\`\`\`\n${truncated}\n\`\`\``);
      } catch (error: any) {
        sections.push(`Referenced file could not be read: ${reference.path} (${error.message})`);
      }
    }

    return sections.join('\n\n');
  }

  private async _getCurrentImagePayload(): Promise<string[] | undefined> {
    if (!this._currentImage) {
      return undefined;
    }

    try {
      const image = await fs.promises.readFile(this._currentImage);
      return [image.toString('base64')];
    } catch (error) {
      console.error('Failed to read attached image:', error);
      return undefined;
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
          console.log('Received webviewReady, sending model list and history');
          await this._sendConnectionStatus(webviewView.webview);
          await this._sendModelList(webviewView.webview);
          await this._sendHistory(webviewView.webview);
          break;
        }
        case 'getHistory': {
          await this._sendHistory(webviewView.webview);
          break;
        }
        case 'loadSession': {
          const sessionId = data.value;
          const history = this._context.globalState.get<ChatSession[]>('chatHistory', []);
          const session = history.find(s => s.id === sessionId);
          if (session) {
            this._currentSession = session;
            this._currentImage = null;
            webviewView.webview.postMessage({ type: 'loadChat', value: session.messages });
          }
          break;
        }
        case 'deleteSession': {
          const sessionId = data.value;
          let history = this._context.globalState.get<ChatSession[]>('chatHistory', []);
          history = history.filter(s => s.id !== sessionId);
          await this._context.globalState.update('chatHistory', history);
          // If we deleted the current session, start a new one
          if (this._currentSession.id === sessionId) {
            this.clearChat();
          }
          await this._sendHistory(webviewView.webview);
          break;
        }
        case 'error': {
          vscode.window.showErrorMessage(data.value);
          break;
        }
        case 'changeModel': {
          const config = vscode.workspace.getConfiguration('orbit');
          const model = data.value;
          const currentMode = config.get<string>('mode', 'cloud');
          
          if (currentMode === 'cloud' || currentMode === 'custom') {
            await config.update('onlineModel', model, vscode.ConfigurationTarget.Global);
          } else {
            await config.update('offlineModel', model, vscode.ConfigurationTarget.Global);
          }
          
          vscode.window.showInformationMessage(`Orbit: Model changed to ${model}`);
          
          // Trigger a new connection check
          await this._sendConnectionStatus(webviewView.webview);
          break;
        }
        case 'pullModel': {
          const modelName = data.value;
          if (!modelName) {return;}

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
            if (!base64Data) {return;}

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
          if (!cmd) {break;}

          webviewView.webview.postMessage({ type: 'status', value: 'Running command...' });

          try {
            const result = await this._terminalService.runWithConfirmation(cmd);
            if (result === null) {
              webviewView.webview.postMessage({ type: 'addResponse', value: '⚠️ Command cancelled by user.' });
            } else {
              let output = '';
              if (result.stdout) {output += result.stdout;}
              if (result.stderr) {output += (output ? '\n' : '') + result.stderr;}
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

  private async _sendConnectionStatus(webview: vscode.Webview) {
    webview.postMessage({ type: 'updateConnectionState', value: { ok: false, message: 'Checking...' } });
    const status = await this._llmClient.checkConnection();
    webview.postMessage({ type: 'updateConnectionState', value: status });
  }

  private async _sendModelList(webview: vscode.Webview) {
    try {
      const models = await this._llmClient.listModels();

      const config = vscode.workspace.getConfiguration('orbit');
      const currentMode = config.get<string>('mode', 'cloud');
      const isOffline = currentMode === 'offline';
      let currentModel = config.get<string>(isOffline ? 'offlineModel' : 'onlineModel') || '';

      // Auto-sync: if the configured model isn't installed/available, switch to the first available one
      if (models.length > 0 && (!currentModel || !models.includes(currentModel))) {
        currentModel = models[0];
        await config.update(isOffline ? 'offlineModel' : 'onlineModel', currentModel, vscode.ConfigurationTarget.Global);
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

  private async _sendHistory(webview: vscode.Webview) {
    const history = this._context.globalState.get<ChatSession[]>('chatHistory', []);
    // Send lightweight metadata for history list
    const sessionList = history.map(s => ({
      id: s.id,
      title: s.title,
      lastModified: s.lastModified,
      messageCount: s.messages.length
    }));
    webview.postMessage({ type: 'updateHistory', value: sessionList });
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

      if (codeBlocks.length !== 1) {return;} // Only auto-apply for single code block responses

      const block = codeBlocks[0];
      const editor = vscode.window.activeTextEditor;
      if (!editor) {return;}

      const activeFile = editor.document.fileName;

      // Check if the block targets this file (by filepath annotation or language match)
      const matchesByPath = block.filePath && activeFile.endsWith(block.filePath.replace(/\//g, path.sep));
      const matchesByLang = !block.filePath && languageMatchesFile(block.language, activeFile);

      if (!matchesByPath && !matchesByLang) {return;}

      // Auto-apply: ask the user if they want to apply
      const choice = await vscode.window.showInformationMessage(
        `Orbit detected code changes for ${path.basename(activeFile)}. Apply them?`,
        'Apply & Review Diff',
        'Skip'
      );

      if (choice !== 'Apply & Review Diff') {return;}

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
        if (filePath.startsWith('http') || filePath.startsWith('data:')) {return match;}
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
