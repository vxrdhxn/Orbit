import * as vscode from 'vscode';
import { Finding } from '../reviewTypes';

export async function showFindings(findings: Finding[]): Promise<void> {
    if (!Array.isArray(findings) || findings.length === 0) {
        vscode.window.showInformationMessage('Orbit: No findings available.');
        return;
    }

    const items = findings.map((finding) => ({
        label: `$(warning) ${finding.title}`,
        description: `${finding.severity} • ${finding.category} • Lines ${finding.location.startLine}-${finding.location.endLine}`,
        detail: finding.description,
        finding
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a finding to inspect',
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (!selected) {
        return;
    }

    try {
        const fileUri = vscode.Uri.file(selected.finding.location.fileName);
        const document = await vscode.workspace.openTextDocument(fileUri);

        const startLine = Math.max(0, selected.finding.location.startLine - 1);
        const endLine = Math.min(
            Math.max(startLine, selected.finding.location.endLine - 1),
            document.lineCount - 1
        );

        const editor = await vscode.window.showTextDocument(document, {
            preview: false,
            viewColumn: vscode.ViewColumn.One
        });

        const range = new vscode.Range(
            startLine,
            0,
            endLine,
            document.lineAt(endLine).text.length
        );

        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to open finding location.';
        vscode.window.showErrorMessage(`Orbit: ${message}`);
    }
}