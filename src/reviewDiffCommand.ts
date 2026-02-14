import * as vscode from 'vscode';
import { ReviewService } from './reviewService';
import { GitAnalyzer, FileDiff } from './reviewGit';
import { PresetManager } from './reviewPresets';
import { CodeInput, ReviewOptions, FindingCategory, SeverityLevel } from './reviewTypes';
import { AnnotationManager } from './reviewAnnotations';

export class ReviewDiffCommand {
    constructor(
        private reviewService: ReviewService,
        private gitAnalyzer: GitAnalyzer,
        private presetManager: PresetManager,
        private annotationManager: AnnotationManager
    ) { }

    async execute() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showWarningMessage('Open a workspace to review git diffs.');
            return;
        }

        // Select Diff Mode
        const mode = await vscode.window.showQuickPick(
            [
                { label: 'Working Tree Changes', description: 'Unstaged changes vs Index', value: 'working' },
                { label: 'Staged Changes', description: 'Index vs HEAD', value: 'staged' },
                { label: 'Branch Changes', description: 'Review changes against main/merged base', value: 'branch' }
            ],
            { placeHolder: 'Select review scope' }
        );

        if (!mode) return;

        // Select Preset (defaulting to Quick Check or PreCommit for diffs usually)
        let preset;
        try {
            preset = await this.presetManager.selectPreset({
                isDiffReview: true,
                // fileType inferred later? Logic in PresetManager
            });
        } catch { return; }


        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Analyzing Git Diff (${mode.label})...`,
            cancellable: false
        }, async (progress) => {
            try {
                let diffs: FileDiff[] = [];
                if (mode.value === 'working') {
                    diffs = await this.gitAnalyzer.getUnstagedChanges();
                } else if (mode.value === 'staged') {
                    diffs = await this.gitAnalyzer.getStagedChanges();
                } else {
                    diffs = await this.gitAnalyzer.getBranchChanges(); // defaults to main
                }

                if (diffs.length === 0) {
                    vscode.window.showInformationMessage('No changes found to review.');
                    return;
                }

                // Prepare CodeInputs
                const codeInputs: CodeInput[] = [];
                for (const diff of diffs) {
                    if (diff.status === 'deleted') continue;

                    // Fetch content
                    let content = '';
                    if (mode.value === 'staged') {
                        // Read from index: path needed, git expects relative from root.
                        // git show :path/to/file
                        // Note: fileName might be relative.
                        content = await this.gitAnalyzer.getFileContent(diff.fileName, `:${diff.fileName}`);
                    } else if (mode.value === 'branch') {
                        content = await this.gitAnalyzer.getFileContent(diff.fileName, `HEAD:${diff.fileName}`); // Diffs are from HEAD to base, so new content is HEAD
                    } else {
                        // Working tree
                        content = await this.gitAnalyzer.getFileContent(diff.fileName);
                    }

                    // Calculate focus ranges from hunks
                    const focusRanges = diff.hunks.map(h => ({
                        start: h.newStart,
                        end: h.newStart + h.newLines - 1
                    }));

                    // Detect language
                    const ext = diff.fileName.split('.').pop() || 'txt';

                    codeInputs.push({
                        content,
                        fileName: diff.fileName,
                        language: ext, // simplistic lang detection, better to use vscode.languages.match
                        focusRanges
                    });
                }

                // Map Preset Config to ReviewOptions
                const options: ReviewOptions = {
                    enabledCategories: preset.config.enabledCategories,
                    minSeverity: preset.config.minSeverity,
                    includeContext: preset.config.includeContext,
                    maxFindings: preset.config.maxFindings,
                    timeoutMs: preset.config.timeoutMs,
                    promptModifiers: preset.config.promptModifiers
                };

                const report = await this.reviewService.reviewCode(codeInputs, options);

                // Show Annotations
                this.annotationManager.updateFindings(report.findings);

                // Show Results - Reusing same result viewer for now, ideally specific Diff viewer.
                // We'll create a temporary doc.
                await this.showResults(report, mode.label, diffs.length);

            } catch (e: any) {
                vscode.window.showErrorMessage(`Git Review failed: ${e.message}`);
            }
        });
    }

    private async showResults(report: any, modeLabel: string, fileCount: number) {
        // Generate Markdown report
        const lines: string[] = [];
        lines.push(`# Git Code Review (${modeLabel})`);
        lines.push(`**Files Reviewed:** ${fileCount}`);
        lines.push(`**Summary:** ${report.summary.message}`);
        lines.push(`**Quality:** ${report.summary.overallQuality}`);
        lines.push(`---`);

        if (report.findings.length === 0) {
            lines.push(`✅ No issues found.`);
        } else {
            for (const f of report.findings) {
                lines.push(`### [${f.severity.toUpperCase()}] ${f.title}`);
                lines.push(`**File:** ${f.location.fileName}`);
                lines.push(`**Location:** Line ${f.location.startLine}-${f.location.endLine}`);
                lines.push(``);
                lines.push(`${f.description}`);
                if (f.suggestedFix) {
                    lines.push(``);
                    lines.push(`**Suggested Fix:**`);
                    lines.push(`\`\`\`ts`);
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
