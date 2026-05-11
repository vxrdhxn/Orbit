import * as vscode from 'vscode';
import { PerformanceAnalysis, EdgeCase, Optimization } from './types';
import { ComplexityDetector } from './ComplexityDetector';
import { EdgeCaseIdentifier } from './EdgeCaseIdentifier';
import { OptimizationSuggester } from './OptimizationSuggester';
import { ILLMClient } from '../providers/ILLMClient';
import { Context } from '../providers/types';

import { LLMRouter } from '../reasoning/LLMRouter';
import { ResponseFormatter } from '../reasoning/ResponseFormatter';
import { StructuredResponse } from '../reasoning/types';

export class PerformanceAnalyzer {
    private complexityDetector: ComplexityDetector;
    private edgeCaseIdentifier: EdgeCaseIdentifier;
    private optimizationSuggester: OptimizationSuggester;

    constructor(
        private llmClient: ILLMClient,
        private router: LLMRouter,
        private formatter: ResponseFormatter
    ) {

        this.complexityDetector = new ComplexityDetector();
        this.edgeCaseIdentifier = new EdgeCaseIdentifier();
        this.optimizationSuggester = new OptimizationSuggester();
    }

    public async analyzeCode(code: string, language: string, context: Context): Promise<PerformanceAnalysis> {
        // 1. Get heuristics
        const heuristicTime = this.complexityDetector.detectTimeComplexity(code);
        const heuristicSpace = this.complexityDetector.detectSpaceComplexity(code);
        const heuristicEdgeCases = this.edgeCaseIdentifier.identifyEdgeCases(code);
        const heuristicOptimizations = this.optimizationSuggester.suggestOptimizations(code);

        // 2. Prepare LLM prompt
        const prompt = `Analyze the following code for performance characteristics:
Language: ${language}

CODE:
\`\`\`${language}
${code}
\`\`\`

Based on my heuristics, I detected:
- Potential Time Complexity: ${heuristicTime}
- Potential Space Complexity: ${heuristicSpace}

Please provide a detailed performance analysis. Include:
- Formal Time Complexity (best, average, worst case) with explanations.
- Formal Space Complexity (auxiliary and total) with explanations.
- Edge cases causing performance degradation.
- Detailed optimization suggestions.

Follow the mandatory structured reasoning format.`;

        // 3. Call AI
        const fullPrompt = `System: You are a performance analysis expert. Analyze code for algorithmic complexity and provide optimization suggestions.\n\nUser: ${this.router.appendStructuredInstructions(prompt)}`;
        const response = await this.llmClient.generate(fullPrompt);
        let structured = this.router.transformResponse(response);

        if (!structured) {
            // Fallback if transformation failed but we still want to give some result
            structured = {
                what: ['Analyzed code for performance.'],
                why: response,
                improvements: 'See AI response.',
                tradeoffs: 'N/A',
                production: 'Review AI response.'
            };
        }

        // 4. Extract specific performance fields from structured response
        // This is a bit of a heuristic extraction as the LLM might put them in different places.
        // We'll look for specific markers in the text.
        const analysis: PerformanceAnalysis = {
            timeComplexity: this.extractTimeComplexity(structured, heuristicTime),
            spaceComplexity: this.extractSpaceComplexity(structured, heuristicSpace),
            edgeCases: this.extractEdgeCases(structured, heuristicEdgeCases),
            optimizations: this.extractOptimizations(structured, heuristicOptimizations),
            reasoning: structured
        };

        return analysis;
    }

    public async analyzeSelection(editor: vscode.TextEditor): Promise<PerformanceAnalysis> {
        const selection = editor.selection;
        const code = editor.document.getText(selection);
        const language = editor.document.languageId;
        return this.analyzeCode(code, language, { activeFile: editor.document.fileName, selection: code, language });
    }

    public async analyzeCurrentFunction(editor: vscode.TextEditor): Promise<PerformanceAnalysis> {
        // For simplicity, we'll use a regex or look around the cursor
        // A better way would be using VS Code's symbols API
        const code = this.extractFunction(editor.document, editor.selection.active);
        const language = editor.document.languageId;
        return this.analyzeCode(code, language, { activeFile: editor.document.fileName, language });
    }

    private extractFunction(document: vscode.TextDocument, position: vscode.Position): string {
        // Simple heuristic: find the block containing the cursor
        const text = document.getText();
        const offset = document.offsetAt(position);

        // Find previous start of function { or (
        let start = offset;
        while (start > 0 && text[start] !== '{') start--;
        // Find matching }
        let end = offset;
        let depth = 0;
        for (let i = start; i < text.length; i++) {
            if (text[i] === '{') depth++;
            else if (text[i] === '}') {
                depth--;
                if (depth === 0) {
                    end = i + 1;
                    break;
                }
            }
        }

        // Go back from { to find function signature
        let sigStart = start;
        while (sigStart > 0 && text[sigStart] !== '\n' && text[sigStart] !== ';') sigStart--;

        return text.substring(sigStart + 1, end).trim();
    }

    private extractTimeComplexity(structured: StructuredResponse, heuristic: string): PerformanceAnalysis['timeComplexity'] {
        const text = structured.why + ' ' + structured.tradeoffs;
        const best = text.match(/best\s*case:\s*([^\n\.,]+)/i)?.[1] || 'Unknown';
        const avg = text.match(/average\s*case:\s*([^\n\.,]+)/i)?.[1] || heuristic;
        const worst = text.match(/worst\s*case:\s*([^\n\.,]+)/i)?.[1] || heuristic;

        return {
            bestCase: best.trim(),
            averageCase: avg.trim(),
            worstCase: worst.trim(),
            explanation: structured.why
        };
    }

    private extractSpaceComplexity(structured: StructuredResponse, heuristic: string): PerformanceAnalysis['spaceComplexity'] {
        const text = structured.why + ' ' + structured.tradeoffs;
        const aux = text.match(/auxiliary:\s*([^\n\.,]+)/i)?.[1] || 'O(1)';
        const total = text.match(/total\s*space:\s*([^\n\.,]+)/i)?.[1] || heuristic;

        return {
            auxiliary: aux.trim(),
            total: total.trim(),
            explanation: structured.tradeoffs
        };
    }

    private extractEdgeCases(structured: StructuredResponse, heuristics: EdgeCase[]): EdgeCase[] {
        // If the LLM mentions edge cases in production or why, we could try to extract them.
        // For now, we combine heuristics with the production section.
        const production = structured.production;
        if (production && production.length > 20) {
            return [...heuristics, {
                scenario: 'AI Identified Edge Case',
                impact: 'See production implications',
                mitigation: production
            }];
        }
        return heuristics;
    }

    private extractOptimizations(structured: StructuredResponse, heuristics: Optimization[]): Optimization[] {
        const improvements = structured.improvements;
        if (improvements && improvements.length > 20) {
            return [...heuristics, {
                title: 'AI Suggested Optimization',
                description: improvements,
                expectedImprovement: 'Moderate',
                reasoning: structured
            }];
        }
        return heuristics;
    }
}
