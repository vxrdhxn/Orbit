import * as vscode from 'vscode';
import { DiffProposal } from '../reasoning/types';

/**
 * Manages the webview panel for Diff Approval.
 */
export class DiffApprovalView {
    public static readonly viewType = 'orbit.diffApproval';
    private _panel: vscode.WebviewPanel | undefined;
    private _disposables: vscode.Disposable[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _onApprove: (selectedHunkIds?: string[]) => void,
        private readonly _onReject: () => void
    ) { }

    /**
     * Shows the diff approval panel with the given proposal.
     */
    public show(proposal: DiffProposal) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this._panel) {
            this._panel.reveal(column);
        } else {
            this._panel = vscode.window.createWebviewPanel(
                DiffApprovalView.viewType,
                'Approve Changes',
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
                    switch (message.command) {
                        case 'approve':
                            this._onApprove(message.selectedHunkIds);
                            this.dispose();
                            return;
                        case 'reject':
                            this._onReject();
                            this.dispose();
                            return;
                    }
                },
                null,
                this._disposables
            );
        }

        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, proposal);
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

    private _getHtmlForWebview(webview: vscode.Webview, proposal: DiffProposal) {
        // NOTE: In a real production setup, we would load the React build.
        // For development/MVP, we can use a simple template or point to the dev server.

        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist', 'assets', 'index.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist', 'assets', 'index.css'));

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Approve Changes</title>
    <link rel="stylesheet" href="${styleUri}">
</head>
<body>
    <div id="root"></div>
    <script>
        const vscode = acquireVsCodeApi();
        window.initialData = ${JSON.stringify(proposal)};
    </script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}
