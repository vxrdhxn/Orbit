import * as vscode from 'vscode';
import { CorrectionManager } from '../CorrectionManager';
import { CorrectionSuggestion } from '../types';
import { SeverityLevel } from '../../reviewTypes';

export class CorrectionDecorationProvider {
    private decorationTypes: Map<SeverityLevel, vscode.TextEditorDecorationType> = new Map();

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly correctionManager: CorrectionManager
    ) {
        this.initializeDecorations();

        // Listen to active editor changes
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor) {this.updateDecorations(editor);}
            }),
            vscode.workspace.onDidChangeTextDocument(e => {
                const editor = vscode.window.activeTextEditor;
                if (editor && e.document === editor.document) {
                    this.updateDecorations(editor);
                }
            })
        );

        // Listen to correction updates
        context.subscriptions.push(
            correctionManager.onDidChangeCorrections(() => {
                const editor = vscode.window.activeTextEditor;
                if (editor) {this.updateDecorations(editor);}
            })
        );
    }

    private initializeDecorations() {
        this.decorationTypes.set(SeverityLevel.Critical, vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 0, 0, 0.1)',
            overviewRulerColor: 'red',
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            after: {
                contentText: ' 🔴',
                color: 'red'
            }
        }));

        this.decorationTypes.set(SeverityLevel.Warning, vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 165, 0, 0.1)',
            overviewRulerColor: 'orange',
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            after: {
                contentText: ' 🟠',
                color: 'orange'
            }
        }));

        this.decorationTypes.set(SeverityLevel.Info, vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(0, 0, 255, 0.1)',
            overviewRulerColor: 'blue',
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            after: {
                contentText: ' 🔵',
                color: 'blue'
            }
        }));

        this.decorationTypes.set(SeverityLevel.Suggestion, vscode.window.createTextEditorDecorationType({
            textDecoration: 'underline dotted',
            overviewRulerColor: 'green',
            overviewRulerLane: vscode.OverviewRulerLane.Right
        }));
    }

    public updateDecorations(editor: vscode.TextEditor) {
        const uri = editor.document.uri;
        const corrections = this.correctionManager.getCorrectionsForFile(uri);

        // Group by severity
        const ranges: Map<SeverityLevel, vscode.Range[]> = new Map();
        Object.values(SeverityLevel).forEach(lvl => ranges.set(lvl, []));

        corrections.forEach(c => {
            const range = new vscode.Range(
                c.location.startLine - 1, 0,
                c.location.endLine - 1, Number.MAX_VALUE
            );
            // Default to Info if unknown severity
            const severity = Object.values(SeverityLevel).includes(c.severity) ? c.severity : SeverityLevel.Info;
            ranges.get(severity)?.push(range);
        });

        // Apply decorations
        this.decorationTypes.forEach((type, severity) => {
            editor.setDecorations(type, ranges.get(severity) || []);
        });
    }
}
