import * as vscode from 'vscode';
import { OllamaClient } from './ollamaClient';
import { ContextGatherer } from './reviewContext';
import {
    ReviewReport,
    ReviewConfig,
    FindingCategory,
    SeverityLevel,
    Finding,
    ReviewSummary,
    ReviewMetadata,
    CodeInput,
    ProjectContext,
    ReviewOptions,
    QualityLevel
} from './reviewTypes';

export class ReviewService {
    constructor(
        private ollamaClient: OllamaClient,
        private contextGatherer: ContextGatherer,
        private config: ReviewConfig
    ) { }

    async reviewCode(code: CodeInput[], options: ReviewOptions): Promise<ReviewReport> {
        // 1. Context Gathering
        const context = await this.contextGatherer.gatherContext(code, { includeContext: options.includeContext });

        // 2. Build Prompt
        const prompt = this.buildPrompt(code, context);

        // 3. Call Ollama
        const startTime = Date.now();
        const response = await this.ollamaClient.generate(prompt, {
            model: 'qwen2.5-coder:7b', // This should come from config, need to wire that up
            json: true
        });
        const durationMs = Date.now() - startTime;

        // 4. Parse Response
        const report = this.parseResponse(response);

        // 5. Fill Metadata
        report.metadata = {
            timestamp: Date.now(),
            filesReviewed: code.map(c => c.fileName),
            linesAnalyzed: code.reduce((acc, c) => acc + (c.content.split('\n').length), 0),
            durationMs: durationMs,
            modelUsed: 'qwen2.5-coder:7b' // TODO: wire up from config
        };

        // 6. Filter based on options
        report.findings = report.findings.filter(f =>
            options.enabledCategories.includes(f.category) &&
            this.isSeverityAllowed(f.severity, options.minSeverity)
        );

        return report;
    }

    private isSeverityAllowed(severity: SeverityLevel, minSeverity: SeverityLevel): boolean {
        const levels = [
            SeverityLevel.Suggestion,
            SeverityLevel.Info,
            SeverityLevel.Warning,
            SeverityLevel.Critical
        ];
        return levels.indexOf(severity) >= levels.indexOf(minSeverity);
    }

    private buildPrompt(codeInputs: CodeInput[], context: ProjectContext): string {
        const codeSection = codeInputs.map(input => {
            let ranges = '';
            if (input.focusRanges && input.focusRanges.length > 0) {
                ranges = input.focusRanges.map(r => `${r.start}-${r.end}`).join(', ');
            } else {
                ranges = `${input.startLine || 1}-${input.endLine || 'END'}`;
            }

            return `
FILE: ${input.fileName}
LANGUAGE: ${input.language}
LINES: ${ranges}
\`\`\`${input.language}
${input.content}
\`\`\`
`;
        }).join('\n\n');

        let contextSection = "";
        if (context.similarCode && context.similarCode.length > 0) {
            contextSection = `
PROJECT CONTEXT (Similar Code):
${context.similarCode.map((c: any) => `
File: ${c.file}
\`\`\`
${c.snippet}
\`\`\`
`).join('\n')}
`;
        }

        return `
SYSTEM CONTEXT:
You are an expert code reviewer analyzing code for quality, bugs, security, and best practices.

${contextSection}

CODE TO REVIEW:
${codeSection}

INSTRUCTIONS:
Analyze the code and provide findings in the following JSON format:
{
  "summary": {
    "overallQuality": "excellent|good|needsImprovement|criticalIssues",
    "message": "Brief overall assessment"
  },
  "findings": [
    {
      "category": "bug|security|performance|style|maintainability|bestPractice",
      "severity": "critical|warning|info|suggestion",
      "title": "Short title",
      "description": "Detailed explanation",
      "location": {
          "fileName": "The filename where this issue is located",
          "startLine": 1,
          "endLine": 2,
          "snippet": "The relevant code snippet"
      },
      "suggestedFix": {
        "description": "What to change",
        "code": "Fixed code snippet"
      }
    }
  ]
}

Focus on:
- Potential bugs and logic errors
- Security vulnerabilities
- Performance issues
- Code smells and maintainability
- Adherence to best practices

Provide specific, actionable feedback.
`;
    }

    private parseResponse(response: string): ReviewReport {
        try {
            // Find JSON block if needed, but Ollama json mode usually returns pure JSON
            const jsonStart = response.indexOf('{');
            const jsonEnd = response.lastIndexOf('}');
            const jsonStr = response.substring(jsonStart, jsonEnd + 1);

            const raw = JSON.parse(jsonStr);

            // Map raw to typed structure with validation/defaults
            return {
                summary: {
                    totalFindings: raw.findings?.length || 0,
                    bySeverity: this.countSeverities(raw.findings),
                    byCategory: this.countCategories(raw.findings),
                    overallQuality: raw.summary?.overallQuality || QualityLevel.Good,
                    message: raw.summary?.message || "Review completed."
                },
                findings: (raw.findings || []).map((f: any) => ({
                    id: Math.random().toString(36).substring(7),
                    category: f.category || FindingCategory.Style,
                    severity: f.severity || SeverityLevel.Info,
                    title: f.title || "Issue",
                    description: f.description || "",
                    location: f.location || { fileName: "", startLine: 1, endLine: 1, snippet: "" },
                    suggestedFix: f.suggestedFix,
                    references: f.references
                })),
                metadata: {
                    timestamp: 0,
                    filesReviewed: [],
                    linesAnalyzed: 0,
                    durationMs: 0,
                    modelUsed: ""
                }
            };
        } catch (e) {
            console.error("Failed to parse review response", e);
            // Return empty error report
            return {
                summary: {
                    totalFindings: 0,
                    bySeverity: { [SeverityLevel.Critical]: 0, [SeverityLevel.Warning]: 0, [SeverityLevel.Info]: 0, [SeverityLevel.Suggestion]: 0 },
                    byCategory: { [FindingCategory.Bug]: 0, [FindingCategory.Security]: 0, [FindingCategory.Performance]: 0, [FindingCategory.Style]: 0, [FindingCategory.Maintainability]: 0, [FindingCategory.BestPractice]: 0 },
                    overallQuality: QualityLevel.Good,
                    message: "Failed to parse AI response."
                },
                findings: [],
                metadata: { timestamp: Date.now(), filesReviewed: [], linesAnalyzed: 0, durationMs: 0, modelUsed: "" }
            };
        }
    }

    private countSeverities(findings: any[]): Record<SeverityLevel, number> {
        const counts = { [SeverityLevel.Critical]: 0, [SeverityLevel.Warning]: 0, [SeverityLevel.Info]: 0, [SeverityLevel.Suggestion]: 0 };
        findings?.forEach(f => {
            if (counts[f.severity as SeverityLevel] !== undefined) {
                counts[f.severity as SeverityLevel]++;
            }
        });
        return counts;
    }

    private countCategories(findings: any[]): Record<FindingCategory, number> {
        const counts = {
            [FindingCategory.Bug]: 0,
            [FindingCategory.Security]: 0,
            [FindingCategory.Performance]: 0,
            [FindingCategory.Style]: 0,
            [FindingCategory.Maintainability]: 0,
            [FindingCategory.BestPractice]: 0
        };
        findings?.forEach(f => {
            if (counts[f.category as FindingCategory] !== undefined) {
                counts[f.category as FindingCategory]++;
            }
        });
        return counts;
    }
}
