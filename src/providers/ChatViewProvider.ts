import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProviderResolver } from './ProviderResolver';
import { Message, Context } from './types';
import { EnhancedContextCollector } from '../context/EnhancedContextCollector';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'orbit.chatView';

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _resolver: ProviderResolver,
        private readonly _contextCollector: EnhancedContextCollector
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Message handling
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'health-request': {
                    const health = await this._resolver.checkHealth();
                    webviewView.webview.postMessage({
                        type: 'health-update',
                        status: health
                    });
                    break;
                }
                case 'chat-request': {
                    const messages: Message[] = data.messages;
                    const context: Context = {
                        activeFile: vscode.window.activeTextEditor?.document.fileName,
                        selection: vscode.window.activeTextEditor?.document.getText(vscode.window.activeTextEditor.selection),
                        language: vscode.window.activeTextEditor?.document.languageId
                    };

                    // Enhanced Context Gathering (Phase 6)
                    const enhancedContext = await this._contextCollector.collectContext('chat');

                    // Inject enhanced context into the request
                    // We can append it to the context or system message
                    if (enhancedContext.pastDecisions.length > 0) {
                        const decisionsText = enhancedContext.pastDecisions
                            .map(d => `- ${d.change_type}: ${d.why}`)
                            .join('\n');
                        messages.push({
                            role: 'user',
                            content: `[CONTEXT] Recent decisions in this project:\n${decisionsText}\n\nPlease consider these decisions when answering.`
                        });
                    }

                    if (enhancedContext.fileStructure.files.length > 0) {
                        const filesText = enhancedContext.fileStructure.files.join(', ');
                        messages.push({
                            role: 'user',
                            content: `[CONTEXT] Related files in current view: ${filesText}`
                        });
                    }

                    try {
                        const provider = await this._resolver.getProvider();
                        const response = await provider.chat(messages, context);
                        webviewView.webview.postMessage({
                            type: 'chat-response',
                            message: {
                                role: 'assistant',
                                content: response.content,
                                model: response.model
                            }
                        });
                    } catch (error: any) {
                        const errorMessage = error.message || 'Unknown error';
                        let detailedError = errorMessage;

                        // Provide helpful hint for Ollama 404
                        if (errorMessage.includes('Ollama failed: Not Found')) {
                            detailedError += '\n\nHint: Do you have the model installed?\nTry running: `ollama pull codellama`';
                        }

                        webviewView.webview.postMessage({
                            type: 'chat-response',
                            message: {
                                role: 'assistant',
                                content: `Error: ${detailedError}`
                            }
                        });
                    }
                    break;
                }
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const uiDistPath = path.join(this._extensionUri.fsPath, 'out', 'webview');
        const manifestPath = path.join(uiDistPath, 'index.html');

        let html = '';
        try {
            html = fs.readFileSync(manifestPath, 'utf8');
        } catch (err) {
            return `<html><body><h1>Error loading UI</h1><p>${err}</p></body></html>`;
        }

        // Create base URI for assets
        const baseUri = webview.asWebviewUri(vscode.Uri.file(uiDistPath));

        // Vite puts assets like ./main.js. We need to replace ./ with webview uri
        // html = html.replace(
        //     /(src|href)="(?:\.\/|\/)?([^"]+)"/g, 
        //     (match, attr, filePath) => {
        //         if (filePath.startsWith('http')) return match; 
        //         return `${attr}="${baseUri}/${filePath}"`;
        //     }
        // );
        // Better regex to match exactly ./ or just filename
        html = html.replace(
            /(src|href)="(\.\/)??([^"]+)"/g,
            (match, attr, dotSlash, filePath) => {
                if (filePath.startsWith('http') || filePath.startsWith('data:')) return match;
                return `${attr}="${baseUri}/${filePath}"`;
            }
        );

        return html;
    }
}
