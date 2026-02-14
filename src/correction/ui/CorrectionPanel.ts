import * as vscode from 'vscode';
import { CorrectionManager } from '../CorrectionManager';
import { CorrectionSuggestion, CorrectionStatus } from '../types';

export class CorrectionPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'orbit.correctionPanel';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly correctionManager: CorrectionManager
    ) {
        correctionManager.onDidChangeCorrections(() => {
            this.updateContent();
        });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'apply':
                    vscode.commands.executeCommand('orbit.applyCorrection', data.id);
                    break;
                case 'reject':
                    vscode.commands.executeCommand('orbit.rejectCorrection', data.id);
                    break;
                case 'open':
                    this.openFile(data.file, data.line);
                    break;
            }
        });

        this.updateContent();
    }

    private openFile(file: string, line: number) {
        vscode.workspace.openTextDocument(vscode.Uri.parse(file)).then(doc => {
            vscode.window.showTextDocument(doc, {
                selection: new vscode.Range(line - 1, 0, line - 1, 0)
            });
        });
    }

    private updateContent() {
        if (!this._view) return;

        const corrections = this.correctionManager.getAllCorrections()
            .filter(c => c.status === CorrectionStatus.Pending);

        this._view.webview.html = this._getHtmlForWebview(corrections);
    }

    private _getHtmlForWebview(corrections: CorrectionSuggestion[]) {
        const style = `
            body { font-family: var(--vscode-font-family); padding: 10px; }
            .correction { margin-bottom: 15px; border: 1px solid var(--vscode-widget-border); padding: 10px; border-radius: 4px; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
            .title { font-weight: bold; font-size: 1.1em; }
            .meta { font-size: 0.9em; opacity: 0.8; }
            .actions { margin-top: 10px; display: flex; gap: 8px; }
            button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 8px; cursor: pointer; }
            button:hover { opacity: 0.9; }
            button.reject { background: var(--vscode-errorForeground); }
        `;

        const items = corrections.map(c => `
            <div class="correction">
                <div class="header">
                    <span class="title">${c.title}</span>
                    <span class="meta">${c.severity}</span>
                </div>
                <div>${c.description}</div>
                <div class="meta" style="margin-top: 4px; cursor: pointer;" onclick="openLocation('${c.location.fileName}', ${c.location.startLine})">
                    ${c.location.fileName.split('/').pop()}:${c.location.startLine}
                </div>
                <div class="actions">
                    <button onclick="apply('${c.id}')">Accept</button>
                    <button class="reject" onclick="reject('${c.id}')">Reject</button>
                </div>
            </div>
        `).join('');

        const script = `
            const vscode = acquireVsCodeApi();
            function apply(id) { vscode.postMessage({ type: 'apply', id: id }); }
            function reject(id) { vscode.postMessage({ type: 'reject', id: id }); }
            function openLocation(file, line) { vscode.postMessage({ type: 'open', file: file, line: line }); }
        `;

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>${style}</style>
            </head>
            <body>
                <h3>Detected Issues (${corrections.length})</h3>
                <div id="list">${items.length ? items : 'No issues detected.'}</div>
                <script>${script}</script>
            </body>
            </html>`;
    }
}
