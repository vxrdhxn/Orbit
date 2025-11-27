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
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Simple vanilla HTML/CSS/JS for the chat interface
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); }
        .chat-input { width: 100%; padding: 8px; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
        .messages { display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; }
        .message { padding: 8px; border-radius: 4px; }
        .user { background: var(--vscode-button-background); color: var(--vscode-button-foreground); align-self: flex-end; }
        .ai { background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); align-self: flex-start; }
        .status { font-style: italic; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
      </style>
    </head>
    <body>
      <div class="messages" id="messages"></div>
      <div class="status" id="status"></div>
      <textarea class="chat-input" id="chatInput" rows="3" placeholder="Ask me anything..."></textarea>
      <script>
        const vscode = acquireVsCodeApi();
        const messagesDiv = document.getElementById('messages');
        const statusDiv = document.getElementById('status');
        const chatInput = document.getElementById('chatInput');

        chatInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const text = chatInput.value;
            if (!text.trim()) return;
            
            addMessage(text, 'user');
            vscode.postMessage({ type: 'sendMessage', value: text });
            chatInput.value = '';
          }
        });

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
          div.textContent = text;
          messagesDiv.appendChild(div);
          window.scrollTo(0, document.body.scrollHeight);
        }
      </script>
    </body>
    </html>`;
  }
}
