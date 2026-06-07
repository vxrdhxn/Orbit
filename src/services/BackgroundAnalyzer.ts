import * as vscode from 'vscode';
import { EnhancedReviewService } from './EnhancedReviewService';
import { Finding, SeverityLevel } from '../reviewTypes';
import { AutoFixEngine } from './AutoFixEngine';

export class BackgroundAnalyzer {
    private diagnostics: vscode.DiagnosticCollection;
    private timeout: NodeJS.Timeout | undefined;
    private readonly debounceMs = 2000;

    constructor(
        private reviewService: EnhancedReviewService,
        private autoFixEngine: AutoFixEngine
    ) {
        this.diagnostics = vscode.languages.createDiagnosticCollection('orbit-pilot');
    }

    public activate(subscriptions: { dispose(): any }[]) {
        vscode.workspace.onDidChangeTextDocument(e => {
            this.triggerAnalysis(e.document);
        }, null, subscriptions);

        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                this.triggerAnalysis(editor.document);
            }
        }, null, subscriptions);

        // Initial analysis if an editor is already open
        if (vscode.window.activeTextEditor) {
            this.triggerAnalysis(vscode.window.activeTextEditor.document);
        }
    }

    private triggerAnalysis(document: vscode.TextDocument) {
        if (document.uri.scheme !== 'file') {return;}

        const config = vscode.workspace.getConfiguration('orbit');
        if (!config.get<boolean>('pilot.enabled', true)) {
            this.diagnostics.clear();
            return;
        }

        if (this.timeout) {
            clearTimeout(this.timeout);
        }

        this.timeout = setTimeout(() => {
            this.analyze(document);
        }, this.debounceMs);
    }

    private async analyze(document: vscode.TextDocument) {
        try {
            const config = vscode.workspace.getConfiguration('orbit');
            const codeInput = {
                content: document.getText(),
                fileName: document.fileName,
                language: document.languageId
            };

            const report = await this.reviewService.reviewCode([codeInput], {
                enabledCategories: config.get<any[]>('review.enabledCategories') || [],
                minSeverity: SeverityLevel.Info,
                includeContext: true
            });

            const autoFixLevelStr = config.get<string>('pilot.autoFixLevel', 'none');
            const autoFixLevel = this.parseSeverity(autoFixLevelStr);

            const diagnostics: vscode.Diagnostic[] = [];

            for (const finding of report.findings) {
                // If finding is within auto-fix threshold and has a fix, apply it
                if (autoFixLevel && this.isSeverityGreaterOrEqual(finding.severity, autoFixLevel) && finding.suggestedFix?.code) {
                    await this.autoFixEngine.applyFix(document, finding);
                    // After auto-fix, we might want to re-analyze, but for now we skip this diagnostics
                    continue;
                }

                const range = new vscode.Range(
                    Math.max(0, finding.location.startLine - 1),
                    0,
                    Math.max(0, finding.location.endLine - 1),
                    100 // End of line approx
                );

                const diagnostic = new vscode.Diagnostic(
                    range,
                    `[Orbit Pilot] ${finding.title}: ${finding.description}`,
                    this.mapSeverity(finding.severity)
                );
                diagnostic.code = finding.id;
                diagnostic.source = 'Orbit';
                diagnostics.push(diagnostic);
            }

            this.diagnostics.set(document.uri, diagnostics);
        } catch (error) {
            console.error('Orbit Background Analysis failed:', error);
        }
    }

    private isSeverityGreaterOrEqual(severity: SeverityLevel, threshold: SeverityLevel): boolean {
        const levels = [
            SeverityLevel.Suggestion,
            SeverityLevel.Info,
            SeverityLevel.Warning,
            SeverityLevel.Critical
        ];
        return levels.indexOf(severity) >= levels.indexOf(threshold);
    }

    private parseSeverity(level: string): SeverityLevel | undefined {
        if (level === 'none') {return undefined;}
        return level as SeverityLevel;
    }

    private mapSeverity(severity: SeverityLevel): vscode.DiagnosticSeverity {
        switch (severity) {
            case SeverityLevel.Critical: return vscode.DiagnosticSeverity.Error;
            case SeverityLevel.Warning: return vscode.DiagnosticSeverity.Warning;
            case SeverityLevel.Info: return vscode.DiagnosticSeverity.Information;
            case SeverityLevel.Suggestion: return vscode.DiagnosticSeverity.Hint;
            default: return vscode.DiagnosticSeverity.Information;
        }
    }

    public clear(uri?: vscode.Uri) {
        if (uri) {
            this.diagnostics.delete(uri);
        } else {
            this.diagnostics.clear();
        }
    }
}
