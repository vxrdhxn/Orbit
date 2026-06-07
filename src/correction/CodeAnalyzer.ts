import * as vscode from 'vscode';
import { ReviewService } from '../reviewService';
import { AnalysisResult, AnalysisTrigger, CorrectionSuggestion, CorrectionStatus } from './types';
import { CodeInput, Finding, SeverityLevel } from '../reviewTypes';

import { CorrectionManager } from './CorrectionManager';

export class CodeAnalyzer {
    private analysisCache: Map<string, AnalysisResult> = new Map();
    private isAnalyzing: boolean = false;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly reviewService: ReviewService,
        private readonly correctionManager: CorrectionManager
    ) { }

    public registerListeners() {
        // Debounce timer for save
        let timeout: NodeJS.Timeout | undefined;

        this.context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument(doc => {
                if (this.shouldAnalyze(doc)) {
                    this.analyzeCode(doc, { type: 'open', scope: 'file' });
                }
            }),
            vscode.workspace.onDidSaveTextDocument(doc => {
                if (this.shouldAnalyze(doc)) {
                    // Debounce save analysis
                    if (timeout) {clearTimeout(timeout);}
                    timeout = setTimeout(() => {
                        this.analyzeCode(doc, { type: 'save', scope: 'file' });
                    }, 500);
                }
            })
        );
    }

    private shouldAnalyze(doc: vscode.TextDocument): boolean {
        // Skip non-code files, git schemes, etc.
        return (
            doc.uri.scheme === 'file' &&
            !doc.fileName.includes('node_modules') &&
            !doc.fileName.includes('.git')
        );
    }

    public async analyzeCode(
        document: vscode.TextDocument,
        trigger: AnalysisTrigger
    ): Promise<AnalysisResult> {
        if (this.isAnalyzing) {
            // Simple concurrency check, might want more robust queueing later
            console.log('Analysis already in progress, skipping or queuing...');
        }

        this.isAnalyzing = true;
        const startTime = Date.now();

        try {
            const input: CodeInput = {
                content: document.getText(),
                fileName: document.fileName,
                language: document.languageId
            };

            // Use existing ReviewService to get findings
            // that prompts specifically for fixes vs just review.
            // For now, reuse reviewCode which returns findings with suggestedFixes.
            const report = await this.reviewService.reviewCode([input], {
                enabledCategories: [], // ReviewService should fallback to config defaults if empty or passed explicitly
                minSeverity: SeverityLevel.Info,
                includeContext: true
            });

            // Convert findings to CorrectionSuggestions
            const corrections: CorrectionSuggestion[] = report.findings.map(f => this.convertToCorrection(f, document));

            const result: AnalysisResult = {
                findings: report.findings,
                corrections: corrections,
                timestamp: startTime
            };

            // Cache result
            this.analysisCache.set(document.uri.toString(), result);

            // Update CorrectionManager
            this.correctionManager.clearCorrectionsForFile(document.uri);
            this.correctionManager.addCorrections(corrections);

            return result;

        } catch (error) {
            console.error('Analysis failed:', error);
            throw error;
        } finally {
            this.isAnalyzing = false;
        }
    }

    private convertToCorrection(finding: Finding, document: vscode.TextDocument): CorrectionSuggestion {
        return {
            ...finding,
            correctionId: Math.random().toString(36).substring(7),
            status: CorrectionStatus.Pending,
            confidence: 0.8, // Placeholder, AI should return this
            applicability: !!finding.suggestedFix,
            dependencies: [],
            diffPreview: finding.suggestedFix ? {
                original: finding.location.snippet,
                modified: finding.suggestedFix.code,
                unified: '...', // Compute unified diff here if needed or later
                startLine: finding.location.startLine,
                endLine: finding.location.endLine
            } : undefined
        };
    }

    public getCachedResult(fileUri: vscode.Uri): AnalysisResult | undefined {
        return this.analysisCache.get(fileUri.toString());
    }

    public clearCache(fileUri: vscode.Uri): void {
        this.analysisCache.delete(fileUri.toString());
    }
}
