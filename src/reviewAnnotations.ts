import * as vscode from 'vscode';
import { Finding, SeverityLevel, CodeLocation } from './reviewTypes';
import { ResponseFormatter } from './reasoning/ResponseFormatter';

export class AnnotationManager {
    private decorationTypes: Map<SeverityLevel, vscode.TextEditorDecorationType>;
    private findings: Finding[] = [];

    constructor() {
        this.decorationTypes = new Map();
        this.initializeDecorations();
    }

    private initializeDecorations() {
        // Critical: Red squiggly
        this.decorationTypes.set(SeverityLevel.Critical, vscode.window.createTextEditorDecorationType({
            overviewRulerColor: 'red',
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            textDecoration: 'underline wavy red'
        }));

        // Warning: Yellow squiggly
        this.decorationTypes.set(SeverityLevel.Warning, vscode.window.createTextEditorDecorationType({
            overviewRulerColor: 'yellow',
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            textDecoration: 'underline wavy yellow'
        }));

        // Info: Blue dotted
        this.decorationTypes.set(SeverityLevel.Info, vscode.window.createTextEditorDecorationType({
            overviewRulerColor: 'blue',
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            textDecoration: 'underline dotted blue'
        }));

        // Suggestion: Green dotted
        this.decorationTypes.set(SeverityLevel.Suggestion, vscode.window.createTextEditorDecorationType({
            overviewRulerColor: 'green',
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            textDecoration: 'underline dotted green'
        }));
    }

    private _onDidChangeFindings = new vscode.EventEmitter<Finding[]>();
    public readonly onDidChangeFindings = this._onDidChangeFindings.event;

    public updateFindings(newFindings: Finding[]) {
        this.findings = newFindings;
        this.refreshDecorations();
        this._onDidChangeFindings.fire(this.findings);
    }

    public getFindings(): Finding[] {
        return this.findings;
    }

    public clear() {
        this.findings = [];
        this.refreshDecorations();
    }

    public refreshDecorations() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {return;}

        const currentFile = editor.document.fileName;

        // Group findings by severity
        const decorations: Map<SeverityLevel, vscode.DecorationOptions[]> = new Map();
        Object.values(SeverityLevel).forEach(s => decorations.set(s, []));

        for (const finding of this.findings) {
            // Normalize paths: handling case sensitivity or separators if needed.
            // Assuming simplified exact match for now.
            if (this.normalizePath(finding.location.fileName) === this.normalizePath(currentFile)) {

                const range = new vscode.Range(
                    finding.location.startLine - 1, 0,
                    finding.location.endLine - 1, Number.MAX_VALUE
                );

                const hoverMessage = new vscode.MarkdownString();
                hoverMessage.isTrusted = true;
                hoverMessage.appendMarkdown(`**[${finding.severity.toUpperCase()}] ${finding.title}**\n\n`);
                hoverMessage.appendMarkdown(`${finding.description}\n\n`);

                if (finding.reasoning) {
                    const formatter = new ResponseFormatter();
                    hoverMessage.appendMarkdown(`---\n### AI Reasoning\n`);
                    hoverMessage.appendMarkdown(formatter.renderMarkdown(finding.reasoning));
                    hoverMessage.appendMarkdown(`\n---\n`);
                }

                if (finding.suggestedFix) {
                    hoverMessage.appendMarkdown(`*Suggested Fix:*\n\`\`\`\n${finding.suggestedFix.code}\n\`\`\`\n`);
                }

                decorations.get(finding.severity)?.push({
                    range,
                    hoverMessage
                });
            }
        }

        // Set decorations
        decorations.forEach((options, severity) => {
            const type = this.decorationTypes.get(severity);
            if (type) {
                editor.setDecorations(type, options);
            }
        });
    }

    private normalizePath(p: string): string {
        // Simple normalization
        return vscode.Uri.file(p).fsPath;
    }
}
