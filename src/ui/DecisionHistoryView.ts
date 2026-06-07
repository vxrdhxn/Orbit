import * as vscode from 'vscode';
import { DecisionRecord } from '../memory/types';

/**
 * Manages the webview panel for Decision History.
 */
export class DecisionHistoryView {
    public static readonly viewType = 'orbit.decisionHistory';
    private _panel: vscode.WebviewPanel | undefined;
    private _disposables: vscode.Disposable[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _onNavigate: (path: string) => void,
        private readonly _onLoadMore?: (offset: number) => DecisionRecord[]
    ) { }

    /**
     * Shows the decision history panel.
     */
    public show(decisions: DecisionRecord[]) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this._panel) {
            this._panel.reveal(column);
            // Update data
            this._panel.webview.postMessage({ type: 'updateDecisions', value: decisions });
        } else {
            this._panel = vscode.window.createWebviewPanel(
                DecisionHistoryView.viewType,
                'Decision History',
                column || vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [this._extensionUri]
                }
            );

            this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

            // Handle messages from the webview
            this._panel.webview.onDidReceiveMessage(
                message => {
                    switch (message.type) {
                        case 'navigateToFile':
                            this._onNavigate(message.value);
                            return;
                        case 'closeHistory':
                            this.dispose();
                            return;
                        case 'fetchMoreDecisions':
                            if (this._onLoadMore) {
                                const moreDecisions = this._onLoadMore(message.offset);
                                this._panel?.webview.postMessage({ type: 'appendDecisions', value: moreDecisions });
                            }
                            return;
                        case 'webviewReady':
                            // Send initial decisions when ready
                            this._panel?.webview.postMessage({ type: 'showHistory', value: decisions });
                            return;
                    }
                },
                null,
                this._disposables
            );
        }

        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, decisions);
    }

    public dispose() {
        this._panel?.dispose();
        this._panel = undefined;
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview, decisions: DecisionRecord[]) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'index.html'));
        // In a real setup, we use the same loader as extension.ts or ChatViewProvider
        // For simplicity here, let's reuse the logic from ChatViewProvider

        const uiDistPath = vscode.Uri.joinPath(this._extensionUri, 'out', 'webview');
        const indexHtmlUri = vscode.Uri.joinPath(uiDistPath, 'index.html');

        let html = '';
        try {
            const fs = require('fs');
            html = fs.readFileSync(indexHtmlUri.fsPath, 'utf8');
        } catch (err) {
            return `<html><body><h1>Error loading UI</h1><p>${err}</p></body></html>`;
        }

        const baseUri = webview.asWebviewUri(uiDistPath);
        html = html.replace(
            /(src|href)="(\.\/)??([^"]+)"/g,
            (match, attr, dotSlash, filePath) => {
                if (filePath.startsWith('http') || filePath.startsWith('data:')) {return match;}
                return `${attr}="${baseUri}/${filePath}"`;
            }
        );

        // Inject initial data
        const safeDecisions = JSON.stringify(decisions).replace(/<\/script>/g, '<\\/script>');
        html = html.replace(
            '<script>',
            `<script>
                window.initialData = { type: 'history', value: ${safeDecisions} };
            `
        );

        return html;
    }
}
