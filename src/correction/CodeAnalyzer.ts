import * as vscode from 'vscode';
import { ReviewService } from '../reviewService';
import { AnalysisResult, AnalysisTrigger, CorrectionSuggestion, CorrectionStatus } from './types';
import { CodeInput, Finding, SeverityLevel } from '../reviewTypes';
import { generateUnifiedDiff } from '../diffUtils';

import { CorrectionManager } from './CorrectionManager';

export class CodeAnalyzer {
    private analysisCache: Map<string, AnalysisResult> = new Map();
    private activePromises: Map<string, Promise<AnalysisResult>> = new Map();
    private pendingRequests: Map<string, { document: vscode.TextDocument; trigger: AnalysisTrigger; resolve: (res: AnalysisResult) => void; reject: (err: any) => void }> = new Map();
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly reviewService: ReviewService,
        private readonly correctionManager: CorrectionManager
    ) { }

    public registerListeners() {
        this.context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument(doc => {
                if (this.shouldAnalyze(doc)) {
                    this.analyzeCode(doc, { type: 'open', scope: 'file' });
                }
            }),
            vscode.workspace.onDidSaveTextDocument(doc => {
                if (this.shouldAnalyze(doc)) {
                    const key = doc.uri.toString();
                    const existingTimer = this.debounceTimers.get(key);
                    if (existingTimer) {
                        clearTimeout(existingTimer);
                    }
                    
                    const timeout = setTimeout(() => {
                        this.debounceTimers.delete(key);
                        this.analyzeCode(doc, { type: 'save', scope: 'file' });
                    }, 500);
                    
                    this.debounceTimers.set(key, timeout);
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

    public analyzeCode(
        document: vscode.TextDocument,
        trigger: AnalysisTrigger
    ): Promise<AnalysisResult> {
        const key = document.uri.toString();
        
        return new Promise((resolve, reject) => {
            // Overwrite any pending request with the latest one
            this.pendingRequests.set(key, { document, trigger, resolve, reject });
            this.processQueue(key);
        });
    }

    private async processQueue(key: string) {
        if (this.activePromises.has(key)) {
            // Already running, processQueue will be called when it finishes
            return;
        }

        const pending = this.pendingRequests.get(key);
        if (!pending) {
            return;
        }

        // Move pending to active
        this.pendingRequests.delete(key);

        const activePromise = this.performAnalysis(pending.document, pending.trigger);
        this.activePromises.set(key, activePromise);

        try {
            const result = await activePromise;
            pending.resolve(result);
        } catch (error) {
            pending.reject(error);
        } finally {
            this.activePromises.delete(key);
            // Check if another request was added while we were analyzing
            this.processQueue(key);
        }
    }

    private async performAnalysis(
        document: vscode.TextDocument,
        trigger: AnalysisTrigger
    ): Promise<AnalysisResult> {
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
        }
    }

    private convertToCorrection(finding: Finding, document: vscode.TextDocument): CorrectionSuggestion {
        let diffPreview;
        if (finding.suggestedFix) {
            const original = finding.location.snippet;
            const modified = finding.suggestedFix.code;
            const unified = generateUnifiedDiff(original, modified, document.fileName);
            diffPreview = {
                original,
                modified,
                unified,
                startLine: finding.location.startLine,
                endLine: finding.location.endLine
            };
        }

        return {
            ...finding,
            correctionId: Math.random().toString(36).substring(7),
            status: CorrectionStatus.Pending,
            confidence: finding.confidence ?? 0.8,
            applicability: !!finding.suggestedFix,
            dependencies: [],
            diffPreview
        };
    }

    public getCachedResult(fileUri: vscode.Uri): AnalysisResult | undefined {
        return this.analysisCache.get(fileUri.toString());
    }

    public clearCache(fileUri: vscode.Uri): void {
        this.analysisCache.delete(fileUri.toString());
    }
}
