import * as vscode from 'vscode';
import { ReviewService } from './reviewService';
import { FindingCategory, SeverityLevel, CodeInput, ReviewOptions } from './reviewTypes';
import { PresetManager, ReviewPreset } from './reviewPresets';
import { CommentConsolidator } from './services/CommentConsolidator';
import { ResponseFormatter } from './reasoning/ResponseFormatter';

export class ReviewCommand {
    constructor(
        private reviewService: ReviewService,
        private presetManager: PresetManager
    ) { }

    async execute() {
        // Determine scope: Selection or active file
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Open a file to review.');
            return;
        }

        const selection = editor.selection;
        const text = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
        const fileName = editor.document.fileName;
        const language = editor.document.languageId;

        const startLine = selection.isEmpty ? 1 : selection.start.line + 1;
        const endLine = selection.isEmpty ? editor.document.lineCount : selection.end.line + 1;

        const codeInput: CodeInput = {
            content: text,
            fileName,
            language,
            startLine,
            endLine
        };

        // Select Preset
        let preset: ReviewPreset;
        try {
            preset = await this.presetManager.selectPreset({
                isDiffReview: false,
                fileType: language
            });
        } catch (e) {
            // Cancelled
            return;
        }

        // UI Feedback
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Reviewing Code (${preset.displayName})...`,
            cancellable: false
        }, async (progress) => {
            try {
                // Map Preset Config to ReviewOptions
                const options: ReviewOptions = {
                    enabledCategories: preset.config.enabledCategories,
                    minSeverity: preset.config.minSeverity,
                    includeContext: preset.config.includeContext,
                    maxFindings: preset.config.maxFindings,
                    timeoutMs: preset.config.timeoutMs,
                    promptModifiers: preset.config.promptModifiers
                };

                const report = await this.reviewService.reviewCode([codeInput], options);

                // Consolidate findings by line for better UI experience
                report.findings = CommentConsolidator.consolidate(report.findings);

                // Show Results (Placeholder: Output Channel or Webview)
                // For MVP: Output Channel or Markdown preview
                await this.showResults(report, preset, language);

            } catch (e: any) {
                vscode.window.showErrorMessage(`Review failed: ${e.message}`);
                console.error(e);
            }
        });
    }

    private async showResults(report: any, preset: ReviewPreset, language: string = 'typescript') {
        // Generate Markdown report
        const lines: string[] = [];
        lines.push(`# Code Review Report (${preset.displayName})`);
        lines.push(`**Date:** ${new Date().toLocaleString()}`);
        lines.push(`**Summary:** ${report.summary.message}`);
        lines.push(`**Quality:** ${report.summary.overallQuality}`);
        lines.push(`---`);

        if (report.findings.length === 0) {
            lines.push(`✅ No issues found.`);
        } else {
            for (const f of report.findings) {
                lines.push(`### [${f.severity.toUpperCase()}] ${f.title}`);
                lines.push(`**Category:** ${f.category}`);
                lines.push(`**Location:** Line ${f.location.startLine}-${f.location.endLine}`);
                lines.push(``);
                lines.push(`${f.description}`);

                if (f.reasoning) {
                    const formatter = new ResponseFormatter();
                    lines.push(``);
                    lines.push(`#### AI Reasoning`);
                    lines.push(formatter.renderMarkdown(f.reasoning));
                }

                if (f.suggestedFix) {
                    lines.push(``);
                    lines.push(`**Suggested Fix:**`);
                    lines.push(`\`\`\`${language}`); 
                    lines.push(f.suggestedFix.code);
                    lines.push(`\`\`\``);
                }
                lines.push(`---`);
            }
        }

        const doc = await vscode.workspace.openTextDocument({ content: lines.join('\n'), language: 'markdown' });
        await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
    }
}
