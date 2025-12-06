import * as vscode from 'vscode';
import { Finding } from './reviewTypes';
import { AnnotationManager } from './reviewAnnotations';

export class ReviewCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor(private annotationManager: AnnotationManager) {
        this.annotationManager.onDidChangeFindings(() => {
            this._onDidChangeCodeLenses.fire();
        });
    }

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
        const lenses: vscode.CodeLens[] = [];
        const currentFile = document.fileName;
        const findings = this.annotationManager.getFindings();
        const fileFindings = findings.filter(f => this.normalizePath(f.location.fileName) === this.normalizePath(currentFile));

        if (fileFindings.length === 0) return [];

        // Add a top-level summary CodeLens
        const total = fileFindings.length;
        const range = new vscode.Range(0, 0, 0, 0); // Top of file
        const cmd: vscode.Command = {
            title: `Orbit: ${total} issues found`,
            command: 'devmind.showReviewPanel', // Make sure this exists or use a dummy
            arguments: []
        };
        lenses.push(new vscode.CodeLens(range, cmd));

        // Add CodeLens for each finding (or grouped by line?)
        // Group by line to avoid clutter
        const byLine = new Map<number, Finding[]>();
        for (const f of fileFindings) {
            const line = f.location.startLine - 1;
            if (!byLine.has(line)) byLine.set(line, []);
            byLine.get(line)?.push(f);
        }

        for (const [line, group] of byLine) {
            const r = new vscode.Range(line, 0, line, 0);
            const title = group.length === 1 ? `Orbit: ${group[0].title}` : `Orbit: ${group.length} issues`;
            // Ensure command exists, or use generic
            lenses.push(new vscode.CodeLens(r, {
                title,
                command: '', // Todo: open details
                tooltip: group.map(g => g.title).join('\n')
            }));
        }

        return lenses;
    }

    private normalizePath(p: string): string {
        return vscode.Uri.file(p).fsPath;
    }
}
