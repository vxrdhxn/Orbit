import * as vscode from 'vscode';
import { generate } from './ollamaClient';
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

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'sendMessage': {
          const userMsg = data.value;
          // Send "thinking" status
          webviewView.webview.postMessage({ type: 'status', value: 'Thinking...' });

          try {
            // RAG: Search for context
            const ws = vscode.workspace.workspaceFolders?.[0];
            let contextText = '';
            if (ws) {
              try {
                const results = await performSearch(userMsg, ws.uri);
                if (results.length > 0) {
                  contextText = "Context from codebase:\n" + results.map(r => `File: ${r.entry.file}\n${r.entry.text}`).join('\n\n');
                }
              } catch (e) {
                console.error('Search failed', e);
              }
            }

            const prompt = contextText ? `${contextText}\n\nUser Question: ${userMsg}` : userMsg;
            const response = await generate(prompt);
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

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
        }
        .input-container {
          padding: 10px;
          background-color: var(--vscode-editor-background);
          border-top: 1px solid var(--vscode-widget-border);
        }
        .chat-input {
          width: 100%;
          padding: 8px;
          box-sizing: border-box;
          background-color: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border);
          border-radius: 4px;
          font-family: inherit;
          resize: none;
        }
        .chat-input:focus {
          outline: 1px solid var(--vscode-focusBorder);
          border-color: var(--vscode-focusBorder);
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
        .code-actions button {
          background: none;
          border: none;
          color: var(--vscode-textLink-foreground);
          cursor: pointer;
          font-family: inherit;
          font-size: inherit;
          padding: 2px 4px;
        }
        .code-actions button:hover {
          text-decoration: underline;
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
    <body>
      <div class="messages" id="messages"></div>
      <div class="status" id="status"></div>
      <div class="input-container">
        <textarea class="chat-input" id="chatInput" rows="2" placeholder="Ask me anything... (Shift+Enter for new line, /help for commands)"></textarea>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        const messagesDiv = document.getElementById('messages');
        const statusDiv = document.getElementById('status');
        const chatInput = document.getElementById('chatInput');

        // Auto-focus input
        chatInput.focus();

        chatInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const text = chatInput.value.trim();
            if (!text) return;
            
            chatInput.value = '';

            // Slash commands
            if (text.startsWith('/')) {
              handleCommand(text);
              return;
            }

            addMessage(text, 'user');
            vscode.postMessage({ type: 'sendMessage', value: text });
          }
        });

        function handleCommand(cmd) {
          const lower = cmd.toLowerCase();
          if (lower === '/clear') {
            messagesDiv.innerHTML = '';
          } else if (lower === '/help') {
            addSystemMessage('Available commands:\\n/clear - Clear chat history\\n/help - Show this help message');
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
          }
        });

        function addMessage(text, sender) {
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
                    <button onclick="copyCode(this)">Copy</button>
                    <button onclick="insertCode(this)">Insert</button>
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

          // Convert newlines to <br> for non-code parts (simplified)
          // Note: This is a very basic parser.
          // We split by code blocks to avoid replacing newlines inside them, but for now let's just replace newlines that aren't in the HTML tags we just added.
          // Actually, since we already replaced code blocks with HTML, we should be careful.
          // A safer way for this simple parser is to replace newlines with <br> ONLY if they are not inside a tag.
          // But for now, let's just rely on white-space: pre-wrap in CSS for the AI message container, 
          // and only use the parser for code blocks.
          // Wait, if we use innerHTML, pre-wrap might not work as expected if we don't have <br>.
          // Actually, pre-wrap preserves newlines in text content.
          // So we don't need to replace \\n with <br> if we use white-space: pre-wrap.
          // However, the code blocks are now HTML, so we need to be careful.
          
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
