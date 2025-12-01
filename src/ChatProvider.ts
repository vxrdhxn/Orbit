import * as vscode from 'vscode';
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
    } catch (e) {
      console.error('Failed to list models', e);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const toolkitUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'toolkit.min.js'));
    const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'codicon.css'));

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource};">
      <script type="module" src="${toolkitUri}" onerror="console.error('Failed to load toolkit script'); window.vscode.postMessage({ type: 'error', value: 'Failed to load toolkit script' });"></script>
      <link href="${codiconsUri}" rel="stylesheet" />
      <script>
        try {
          window.vscode = acquireVsCodeApi();
          console.log('VS Code API acquired');
        } catch (e) {
          console.error('Failed to acquire VS Code API', e);
        }
        
        window.onerror = function(message, source, lineno, colno, error) {
          console.error('Global Error:', message, source, lineno);
          if (window.vscode) {
            window.vscode.postMessage({ 
              type: 'error', 
              value: 'Global Error: ' + message + ' at ' + source + ':' + lineno 
            });
          }
        };
      </script>
      <style>
        body {
          font-family: var(--vscode-font-family);
          background-color: var(--vscode-editor-background);
          color: var(--vscode-editor-foreground);
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
        }

        /* Empty State Styling */
        body.empty {
          justify-content: center;
          align-items: center;
        }
        body.empty .messages {
          display: none;
        }
        body.empty .input-container {
          width: 100%;
          max-width: 600px;
          padding: 0 20px;
          box-sizing: border-box;
          border-top: none;
          background-color: transparent;
        }
        body.empty .input-box {
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
          border: 1px solid var(--vscode-widget-border);
        }
        .empty-header {
          display: none;
          font-size: 1.5em;
          font-weight: 600;
          margin-bottom: 20px;
          color: var(--vscode-editor-foreground);
          opacity: 0.9;
          text-align: center;
        }
        body.empty .empty-header {
          display: block;
        }

        .messages {
          flex-grow: 1;
          overflow-y: auto;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .message {
          padding: 10px 14px;
          border-radius: 14px;
          max-width: 85%;
          line-height: 1.5;
          word-wrap: break-word;
          font-size: var(--vscode-font-size);
        }
        .message.user {
          background-color: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          align-self: flex-end;
          border-bottom-right-radius: 2px;
          white-space: pre-wrap;
        }
        .message.ai {
          background-color: var(--vscode-editor-inactiveSelectionBackground);
          color: var(--vscode-editor-foreground);
          align-self: flex-start;
          border: 1px solid var(--vscode-widget-border);
          border-bottom-left-radius: 2px;
        }
        .status {
          padding: 0 10px;
          margin-bottom: 5px;
          font-style: italic;
          color: var(--vscode-descriptionForeground);
          font-size: 0.85em;
          min-height: 1.2em;
          text-align: center;
        }

        /* Input Area Redesign */
        .input-container {
          padding: 15px;
          background-color: var(--vscode-editor-background);
        }
        .input-box {
          border: 1px solid var(--vscode-input-border);
          border-radius: 10px;
          background-color: var(--vscode-input-background);
          padding: 10px 10px 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          position: relative; /* For context menu positioning */
        }
        .input-box:focus-within {
          border-color: var(--vscode-focusBorder);
          outline: 1px solid var(--vscode-focusBorder);
        }
        vscode-text-area {
          width: 100%;
          --input-background: transparent;
          border: none;
          resize: none;
          margin-bottom: 4px;
        }
        /* Hide default border of text area since we have a wrapper */
        vscode-text-area::part(control) {
          border: none !important;
          background: transparent !important;
          font-family: var(--vscode-font-family);
        }

        .input-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 4px;
        }
        .toolbar-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .toolbar-item {
          color: var(--vscode-descriptionForeground);
          font-size: 0.85em;
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          padding: 4px 6px;
          border-radius: 4px;
          transition: background-color 0.2s;
        }
        .toolbar-item:hover {
          background-color: var(--vscode-toolbar-hoverBackground);
          color: var(--vscode-foreground);
        }

        /* Context Menu Styling */
        .context-menu {
          display: none;
          position: absolute;
          bottom: 100%; /* Position above the input box */
          left: 0;
          margin-bottom: 5px;
          background-color: var(--vscode-menu-background);
          border: 1px solid var(--vscode-menu-border);
          border-radius: 6px;
          padding: 4px 0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          z-index: 100;
          min-width: 150px;
        }
        .context-menu.visible {
          display: block;
        }
        .menu-header {
          padding: 4px 12px;
          font-size: 0.8em;
          color: var(--vscode-descriptionForeground);
          border-bottom: 1px solid var(--vscode-menu-separatorBackground);
          margin-bottom: 4px;
        }
        .menu-item {
          padding: 6px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 0.9em;
          color: var(--vscode-menu-foreground);
        }
        .menu-item:hover {
          background-color: var(--vscode-menu-selectionBackground);
          color: var(--vscode-menu-selectionForeground);
        }
        .menu-item .codicon {
          font-size: 16px;
        }

        /* Minimalist Dropdown for Model */
        vscode-dropdown {
          min-width: auto;
          --dropdown-border: transparent;
          --dropdown-background: transparent;
          margin: 0;
          height: 20px;
        }
        vscode-dropdown::part(control) {
          background: transparent;
          border: none;
          color: var(--vscode-descriptionForeground);
          min-height: 20px;
          padding: 0;
        }
        vscode-dropdown::part(listbox) {
          background: var(--vscode-dropdown-background);
          border: 1px solid var(--vscode-dropdown-border);
        }

        /* Add Context Button Styling */
        #addContextBtn {
          border-radius: 50%;
          width: 24px;
          height: 24px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          transition: background-color 0.2s;
        }
        #addContextBtn:hover {
          background-color: var(--vscode-button-secondaryHoverBackground);
        }
        #addContextBtn .codicon {
          font-size: 14px;
        }

        /* Send Button Alignment & Animation */
        #sendBtn {
          border-radius: 50%;
          width: 28px;
          height: 28px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s;
        }
        #sendBtn::part(control) {
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
        }
        #sendBtn span {
          font-size: 16px;
          display: block;
        }

        /* Pulse Animation for Cancel State */
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(255, 0, 0, 0); }
          100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0); }
        }
        #sendBtn.cancel {
          background-color: var(--vscode-errorForeground) !important;
          animation: pulse 1.5s infinite;
        }

        /* Code Block Styling */
        .code-block {
          background-color: var(--vscode-textBlockQuote-background);
          border: 1px solid var(--vscode-textBlockQuote-border);
          border-radius: 4px;
          margin: 8px 0;
          overflow: hidden;
        }
        .code-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 8px;
          background-color: var(--vscode-editor-lineHighlightBackground);
          border-bottom: 1px solid var(--vscode-textBlockQuote-border);
          font-size: 0.85em;
        }
        .code-actions {
          display: flex;
          gap: 6px;
        }
        pre {
          margin: 0;
          padding: 8px;
          overflow-x: auto;
          font-family: var(--vscode-editor-font-family);
          font-size: var(--vscode-editor-font-size);
        }
        code {
          font-family: var(--vscode-editor-font-family);
        }

        /* Scrollbar styling */
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); border-radius: 5px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }
        ::-webkit-scrollbar-thumb:active { background: var(--vscode-scrollbarSlider-activeBackground); }
      </style>
    </head>
    <body class="empty">
      <div class="empty-header">DevMind</div>

      <div class="messages" id="messages"></div>
      <div class="status" id="status"></div>

      <div class="input-container">
        <div class="input-box">
          <vscode-text-area id="chatInput" rows="2" placeholder="Ask anything (Ctrl+L), @ to mention, / for workflows" resize="none"></vscode-text-area>

          <!-- Context Menu -->
          <div class="context-menu" id="contextMenu">
            <div class="menu-header">Add context</div>
            <div class="menu-item" onclick="handleMenuOption('images')">
              <span class="codicon codicon-file-media"></span>
              <span>Images</span>
            </div>
            <div class="menu-item" onclick="handleMenuOption('mentions')">
              <span class="codicon codicon-mention"></span>
              <span>Mentions</span>
            </div>
            <div class="menu-item" onclick="handleMenuOption('workflows')">
              <span class="codicon codicon-git-merge"></span>
              <span>Workflows</span>
            </div>
          </div>

          <div class="input-toolbar">
            <div class="toolbar-left">
              <div class="toolbar-item" title="Add Context" id="addContextBtn">
                <span class="codicon codicon-add"></span>
              </div>

              <!-- Model Selector -->
              <div class="toolbar-item">
                <vscode-dropdown id="modelSelect">
                  <vscode-option>Loading...</vscode-option>
                </vscode-dropdown>
              </div>
            </div>

            <vscode-button appearance="primary" id="sendBtn" aria-label="Send">
              <span class="codicon codicon-arrow-right"></span>
            </vscode-button>
          </div>
        </div>
      </div>

      <script>
        console.log('Body script started');
        const vscode = window.vscode;
        // Notify backend that webview is ready
        if (vscode) {
          vscode.postMessage({ type: 'webviewReady' });
        }
        
        const messagesDiv = document.getElementById('messages');
        const statusDiv = document.getElementById('status');
        const chatInput = document.getElementById('chatInput');
        const modelSelect = document.getElementById('modelSelect');
        const sendBtn = document.getElementById('sendBtn');
        const contextMenu = document.getElementById('contextMenu');
        const addContextBtn = document.getElementById('addContextBtn');

        let currentAiMessageDiv = null;
        let currentAiMessageText = '';
        let isGenerating = false;

        // Auto-focus input
        chatInput.focus();

        // Toggle Context Menu
        addContextBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          contextMenu.classList.toggle('visible');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
          if (!contextMenu.contains(e.target) && !addContextBtn.contains(e.target)) {
            contextMenu.classList.remove('visible');
          }
        });

        // Handle Menu Options
        window.handleMenuOption = (option) => {
          contextMenu.classList.remove('visible');
          if (option === 'images') {
            vscode.postMessage({ type: 'selectImage' });
          } else if (option === 'mentions') {
            chatInput.value += '@';
            chatInput.focus();
          } else if (option === 'workflows') {
            chatInput.value += '/';
            chatInput.focus();
          }
        };

        // Handle Model Selection
        modelSelect.addEventListener('change', (e) => {
          const val = e.target.value;
          if (val.includes('(Download)')) {
            const modelName = val.replace(' (Download)', '');
            vscode.postMessage({ type: 'pullModel', value: modelName });
          } else if (val) {
            vscode.postMessage({ type: 'changeModel', value: val });
          }
        });

        // Send Message Logic
        function sendMessage() {
          console.log('sendMessage called');
          if (isGenerating) {
            console.log('isGenerating is true, cancelling');
            // Cancel logic
            vscode.postMessage({ type: 'cancelGeneration' });
            setGenerating(false);
            return;
          }

          const text = chatInput.value.trim();
          console.log('chatInput value:', text);
          if (!text) {
            console.log('Text is empty');
            return;
          }

          chatInput.value = '';
          document.body.classList.remove('empty'); // Switch to chat mode

          // Slash commands
          if (text.startsWith('/')) {
            handleCommand(text);
            return;
          }

          addMessage(text, 'user');
          setGenerating(true);
          vscode.postMessage({ type: 'sendMessage', value: text });
          console.log('Message posted to backend');

          // Reset streaming state
          currentAiMessageDiv = null;
          currentAiMessageText = '';
        }

        function setGenerating(generating) {
          isGenerating = generating;
          const icon = sendBtn.querySelector('.codicon');
          if (generating) {
            sendBtn.classList.add('cancel');
            icon.classList.remove('codicon-arrow-right');
            icon.classList.add('codicon-debug-stop');
            sendBtn.setAttribute('aria-label', 'Cancel');
          } else {
            sendBtn.classList.remove('cancel');
            icon.classList.remove('codicon-debug-stop');
            icon.classList.add('codicon-arrow-right');
            sendBtn.setAttribute('aria-label', 'Send');
          }
        }

        chatInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
          }
        });

        sendBtn.addEventListener('click', () => {
          sendMessage();
        });

        function handleCommand(cmd) {
          const lower = cmd.toLowerCase();
          if (lower === '/clear') {
            messagesDiv.innerHTML = '';
            document.body.classList.add('empty'); // Switch back to empty mode if cleared
          } else if (lower === '/help') {
            addSystemMessage('Available commands:\\n/clear - Clear chat history\\n/explain - Explain active file\\n/fix - Fix active file\\n/test - Generate tests\\n/pull <model> - Pull a new model\\n/help - Show this help message');
          } else if (lower.startsWith('/pull ')) {
            const model = cmd.substring(6).trim();
            if (model) {
              vscode.postMessage({ type: 'pullModel', value: model });
              addSystemMessage('Pulling model: ' + model);
            }
          } else if (lower.startsWith('/explain') || lower.startsWith('/fix') || lower.startsWith('/test')) {
            addMessage(cmd, 'user');
            setGenerating(true);
            vscode.postMessage({ type: 'sendMessage', value: cmd });
            currentAiMessageDiv = null;
            currentAiMessageText = '';
          } else {
            addSystemMessage('Unknown command: ' + cmd);
          }
        }

        window.addEventListener('message', event => {
          const message = event.data;
          console.log('Webview received message:', message.type);
          switch (message.type) {
            case 'addResponse':
              addMessage(message.value, 'ai');
              setGenerating(false);
              break;
            case 'addResponseChunk':
              handleResponseChunk(message.value);
              break;
            case 'status':
              statusDiv.textContent = message.value;
              if (message.value === '') setGenerating(false);
              break;
            case 'updateModels':
              console.log('Updating models:', message.value);
              updateModelList(message.value.models, message.value.current);
              break;
            case 'imageSelected':
              addMessage('Image selected: ' + message.value, 'user');
              break;
            case 'clearChat':
              messagesDiv.innerHTML = '';
              document.body.classList.add('empty');
              break;
            case 'loadChat':
              messagesDiv.innerHTML = '';
              document.body.classList.remove('empty');
              message.value.forEach(msg => {
                addMessage(msg.content, msg.role);
              });
              break;
          }
        });

        function handleResponseChunk(chunk) {
          document.body.classList.remove('empty');

          if (!currentAiMessageDiv) {
            currentAiMessageDiv = document.createElement('div');
            currentAiMessageDiv.className = 'message ai';
            messagesDiv.appendChild(currentAiMessageDiv);
          }

          currentAiMessageText += chunk;
          currentAiMessageDiv.innerHTML = parseMarkdown(currentAiMessageText);
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        function updateModelList(models, current) {
          modelSelect.innerHTML = '';
          models.forEach(m => {
            const opt = document.createElement('vscode-option');
            opt.textContent = m;
            opt.value = m;
            if (m === current) opt.selected = true;
            modelSelect.appendChild(opt);
          });
        }

        function addMessage(text, sender) {
          document.body.classList.remove('empty'); // Ensure we are in chat mode
          const div = document.createElement('div');
          div.className = 'message ' + sender;

          if (sender === 'ai') {
            div.innerHTML = parseMarkdown(text);
          } else {
            div.textContent = text;
          }

          messagesDiv.appendChild(div);
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        function addSystemMessage(text) {
          document.body.classList.remove('empty');
          const div = document.createElement('div');
          div.className = 'message system';
          div.style.fontStyle = 'italic';
          div.style.opacity = '0.8';
          div.textContent = text;
          messagesDiv.appendChild(div);
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        // Simple Markdown Parser
        function parseMarkdown(text) {
          // Escape HTML first to prevent XSS (basic)
          let escaped = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

          // Code blocks
          escaped = escaped.replace(/\\x60\\x60\\x60(\\w+)?\\n([\\s\\S]*?)\\x60\\x60\\x60/g, (match, lang, code) => {
            const language = lang || 'text';
            const encodedCode = encodeURIComponent(code);
            return '<div class="code-block">' +
                '<div class="code-header">' +
                  '<span class="lang-label">' + language + '</span>' +
                  '<div class="code-actions">' +
                    '<vscode-button appearance="secondary" style="height: 20px; font-size: 10px;" onclick="copyCode(this)">Copy</vscode-button>' +
                    '<vscode-button appearance="secondary" style="height: 20px; font-size: 10px;" onclick="insertCode(this)">Insert</vscode-button>' +
                  </div>' +
                '</div>' +
                '<pre><code data-code="' + encodedCode + '">' + code + '</code></pre>' +
              '</div>';
          });

          // Inline code
          escaped = escaped.replace(/\\x60([^\\x60]+)\\x60/g, '<code>$1</code>');

          // Bold: **...**
          escaped = escaped.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');

          // Italic: *...*
          escaped = escaped.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');

          return escaped;
        }

        // Global functions for buttons
        window.copyCode = (btn) => {
          const codeEl = btn.closest('.code-header').nextElementSibling.querySelector('code');
          const code = decodeURIComponent(codeEl.getAttribute('data-code'));
          vscode.postMessage({ type: 'copyCode', value: code });
        };

        window.insertCode = (btn) => {
          const codeEl = btn.closest('.code-header').nextElementSibling.querySelector('code');
          const code = decodeURIComponent(codeEl.getAttribute('data-code'));
          vscode.postMessage({ type: 'insertCode', value: code });
        };
      </script>
    </body>
    </html>`;
  }
}
