import * as vscode from 'vscode';
import { generate, listModels } from './ollamaClient';
import { performSearch } from './searchCommand';

export class ChatProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'offlineDevAssistant.chatView';

  constructor(private readonly _extensionUri: vscode.Uri) { }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
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

          // Wait a bit and refresh list (user will likely have to refresh manually after pull finishes, but we can try)
          setTimeout(() => this._sendModelList(webviewView.webview), 5000);
          break;
        }
        case 'sendMessage': {
          const userMsg = data.value;
          // Send "thinking" status
          webviewView.webview.postMessage({ type: 'status', value: 'Thinking...' });

          try {
            // 1. Get Active Editor Context
            const editor = vscode.window.activeTextEditor;
            let activeContext = '';
            if (editor) {
              const doc = editor.document;
              const selection = editor.selection;
              const text = doc.getText(selection.isEmpty ? undefined : selection);
              const filename = vscode.workspace.asRelativePath(doc.uri);
              activeContext = `\n\nActive File/Selection (${filename}):\n\`\`\`\n${text}\n\`\`\`\n`;
            }

            // 2. Check for slash commands
            let commandInstruction = '';
            if (userMsg.startsWith('/explain')) commandInstruction = "Explain the code in the active file/selection.";
            else if (userMsg.startsWith('/fix')) commandInstruction = "Propose a fix for the code in the active file/selection.";
            else if (userMsg.startsWith('/test')) commandInstruction = "Generate unit tests for the code in the active file/selection.";

            // 3. Explicit File Lookup (Scan message for filenames)
            const ws = vscode.workspace.workspaceFolders?.[0];
            let fileContext = '';
            if (ws) {
              const words = userMsg.split(/\s+/);
              const potentialFiles = words.filter((w: string) => /\.[a-zA-Z0-9]+$/.test(w)); // Simple regex for extension
              for (const file of potentialFiles) {
                // Remove punctuation
                const cleanFile = file.replace(/[^\w\.-]/g, '');
                const found = await vscode.workspace.findFiles(`**/${cleanFile}`, '**/node_modules/**', 1);
                if (found.length > 0) {
                  const doc = await vscode.workspace.openTextDocument(found[0]);
                  fileContext += `\n\nReferenced File (${cleanFile}):\n\`\`\`\n${doc.getText()}\n\`\`\`\n`;
                }
              }
            }

            // 4. RAG: Search for context (Skip if specific command is used to keep focus, or if no workspace)
            let ragContext = '';
            if (ws && !commandInstruction) {
              try {
                const results = await performSearch(userMsg, ws.uri);
                if (results.length > 0) {
                  ragContext = "Context from codebase:\n" + results.map(r => `File: ${r.entry.file}\n${r.entry.text}`).join('\n\n');
                }
              } catch (e) {
                console.error('Search failed', e);
              }
            }

            // 5. Construct Final Prompt
            const systemPrompt = "You are DevMind, an intelligent coding assistant. You have access to the user's codebase through the context provided below. If the user asks about a specific file, look for its content in the context. Do not complain about missing file access if the content is provided. Be concise and helpful.";

            let finalPrompt = '';
            if (commandInstruction) {
              finalPrompt = `${systemPrompt}\n\n${commandInstruction}\n${activeContext}\n${fileContext}\n\nUser Request: ${userMsg}`;
            } else {
              finalPrompt = `${systemPrompt}\n\n${ragContext}\n${activeContext}\n${fileContext}\n\nUser Question: ${userMsg}`;
            }

            const response = await generate(finalPrompt);
            webviewView.webview.postMessage({ type: 'addResponse', value: response });
          } catch (e: any) {
            webviewView.webview.postMessage({ type: 'addResponse', value: `Error: ${e.message}` });
          } finally {
            webviewView.webview.postMessage({ type: 'status', value: '' });
          }
          break;
        }
        case 'insertCode': {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            editor.edit(editBuilder => {
              editBuilder.insert(editor.selection.active, data.value);
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

  private async _sendModelList(webview: vscode.Webview) {
    try {
      const models = await listModels();
      const currentModel = vscode.workspace.getConfiguration('offlineDevAssistant').get<string>('model');
      webview.postMessage({ type: 'updateModels', value: { models, current: currentModel } });
    } catch (e) {
      console.error('Failed to list models', e);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const toolkitUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'webview-ui-toolkit', 'dist', 'toolkit.min.js'));
    const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'));

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script type="module" src="${toolkitUri}"></script>
      <link href="${codiconsUri}" rel="stylesheet" />
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
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            border: 1px solid var(--vscode-widget-border);
        }
        .empty-header {
            display: none;
            font-size: 1.5em;
            font-weight: 600;
            margin-bottom: 20px;
            color: var(--vscode-editor-foreground);
            opacity: 0.9;
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
          border-radius: 8px;
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
        
        /* Send Button Alignment */
        #sendBtn {
            border-radius: 50%;
            width: 28px;
            height: 28px;
            padding: 0;
            /* Remove flex display to let vscode-button handle alignment */
        }
        #sendBtn span {
            font-size: 16px;
            line-height: 28px; /* Help vertical centering */
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
      <div class="empty-header">DevMind2.0</div>
      
      <div class="messages" id="messages"></div>
      <div class="status" id="status"></div>
      
      <div class="input-container">
        <div class="input-box">
          <vscode-text-area id="chatInput" rows="2" placeholder="Ask anything (Ctrl+L), @ to mention, / for workflows" resize="vertical"></vscode-text-area>
          <div class="input-toolbar">
            <div class="toolbar-left">
              <div class="toolbar-item" title="Add Context">
                <span class="codicon codicon-add"></span>
              </div>
              
              <!-- Planning Mode Placeholder -->
              <div class="toolbar-item" title="Mode: Planning">
                <span>Planning</span>
                <span class="codicon codicon-chevron-down" style="font-size: 10px;"></span>
              </div>

              <!-- Model Selector -->
              <div class="toolbar-item">
                 <vscode-dropdown id="modelSelect">
                    <vscode-option>Loading...</vscode-option>
                 </vscode-dropdown>
              </div>
            </div>
            
            <vscode-button appearance="primary" id="sendBtn" aria-label="Send">
              <span class="codicon codicon-arrow-up"></span>
            </vscode-button>
          </div>
        </div>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        const messagesDiv = document.getElementById('messages');
        const statusDiv = document.getElementById('status');
        const chatInput = document.getElementById('chatInput');
        const modelSelect = document.getElementById('modelSelect');
        const sendBtn = document.getElementById('sendBtn');

        // Auto-focus input
        chatInput.focus();

        // Handle Model Selection
        modelSelect.addEventListener('change', (e) => {
          const model = e.target.value;
          if (model) {
            vscode.postMessage({ type: 'changeModel', value: model });
          }
        });

        // Send Message Logic
        function sendMessage() {
          const text = chatInput.value.trim();
          if (!text) return;
          
          chatInput.value = '';
          document.body.classList.remove('empty'); // Switch to chat mode

          // Slash commands
          if (text.startsWith('/')) {
            handleCommand(text);
            return;
          }

          addMessage(text, 'user');
          vscode.postMessage({ type: 'sendMessage', value: text });
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
             if(model) {
                vscode.postMessage({ type: 'pullModel', value: model });
                addSystemMessage('Pulling model: ' + model);
             }
          } else if (lower.startsWith('/explain') || lower.startsWith('/fix') || lower.startsWith('/test')) {
             addMessage(cmd, 'user');
             vscode.postMessage({ type: 'sendMessage', value: cmd });
          } else {
            addSystemMessage('Unknown command: ' + cmd);
          }
        }

        window.addEventListener('message', event => {
          const message = event.data;
          switch (message.type) {
            case 'addResponse':
              addMessage(message.value, 'ai');
              break;
            case 'status':
              statusDiv.textContent = message.value;
              break;
            case 'updateModels':
              updateModelList(message.value.models, message.value.current);
              break;
          }
        });

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

          // Code blocks: \`\`\`lang ... \`\`\`
          escaped = escaped.replace(/\\\`\\\`\\\`(\\w+)?\\n([\\s\\S]*?)\\\`\\\`\\\`/g, (match, lang, code) => {
            const language = lang || 'text';
            // encode code for attribute
            const encodedCode = encodeURIComponent(code);
            return \`
              <div class="code-block">
                <div class="code-header">
                  <span class="lang-label">\${language}</span>
                  <div class="code-actions">
                    <vscode-button appearance="secondary" style="height: 20px; font-size: 10px;" onclick="copyCode(this)">Copy</vscode-button>
                    <vscode-button appearance="secondary" style="height: 20px; font-size: 10px;" onclick="insertCode(this)">Insert</vscode-button>
                  </div>
                </div>
                <pre><code data-code="\${encodedCode}">\${code}</code></pre>
              </div>
            \`;
          });

          // Inline code: \`...\`
          escaped = escaped.replace(/\\\`([^\\\`]+)\\\`/g, '<code>$1</code>');

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
