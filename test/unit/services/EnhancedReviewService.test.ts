jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: () => ({
            get: (key: string, defaultValue: any) => defaultValue
        })
    }
}), { virtual: true });

import { EnhancedReviewService } from '../../../src/services/EnhancedReviewService';
import { OllamaClient } from '../../../src/ollamaClient';
import { ContextGatherer } from '../../../src/reviewContext';
import { FindingCategory, SeverityLevel, ReviewConfig, CodeInput, ProjectContext } from '../../../src/reviewTypes';
import { LLMRouter } from '../../../src/reasoning/LLMRouter';
import { ResponseFormatter } from '../../../src/reasoning/ResponseFormatter';

class MockOllamaClient extends OllamaClient {
    public mockResponse: string = "{}";
    public capturedPrompt: string = "";
    constructor() { super("http://127.0.0.1:11434"); }
    async generate(prompt: string, params?: any): Promise<string> {
        this.capturedPrompt = prompt;
        return this.mockResponse;
    }
}

class MockContextGatherer extends ContextGatherer {
    constructor() { super({} as any); }
    async gatherContext(code: CodeInput[], options: { includeContext: boolean }): Promise<ProjectContext> {
        return { similarCode: [], namingConventions: {}, commonPatterns: [] };
    }
}

const mockConfig: ReviewConfig = {
    enabledCategories: [FindingCategory.Bug],
    minSeverity: SeverityLevel.Info,
    includeContext: false,
    maxFindings: 10,
    autoApplyFixes: false
};

describe('EnhancedReviewService', () => {
    let service: EnhancedReviewService;
    let mockOllama: MockOllamaClient;
    let router: LLMRouter;

    beforeEach(() => {
        mockOllama = new MockOllamaClient();
        const mockContext = new MockContextGatherer();
        const formatter = new ResponseFormatter();
        router = new LLMRouter(formatter, { maxRetries: 1, enforceFormat: true });
        service = new EnhancedReviewService(mockOllama, mockContext, mockConfig, router);
    });

    it('should inject structured reasoning instructions into the prompt', async () => {
        mockOllama.mockResponse = JSON.stringify({ summary: {}, findings: [] });

        await service.reviewCode([{ content: "test", fileName: "test.ts", language: "ts" }], {
            enabledCategories: [],
            minSeverity: SeverityLevel.Info,
            includeContext: false
        });

        expect(mockOllama.capturedPrompt).toContain('### What changed');
        expect(mockOllama.capturedPrompt).toContain('### Why');
        expect(mockOllama.capturedPrompt).toContain('CRITICAL: Every finding');
    });

    it('should parse structured reasoning in findings', async () => {
        mockOllama.mockResponse = JSON.stringify({
            summary: { overallQuality: "good", message: "ok" },
            findings: [{
                category: "bug",
                severity: "warning",
                title: "Bug 1",
                description: "Desc",
                location: { fileName: "t.ts", startLine: 1, endLine: 1, snippet: "c" },
                reasoning: "### What changed\n- Refactored logic to be much more readable\n### Why\nThe old stuff was very bad and complicated\n### Improvements\nMake it better and faster in the future\n### Tradeoffs\nNone that are worth mentioning here\n### Production Considerations\nSafe to deploy to all regions immediately"
            }]
        });

        const report = await service.reviewCode([], {
            enabledCategories: [FindingCategory.Bug],
            minSeverity: SeverityLevel.Info,
            includeContext: false
        });

        expect(report.findings).toHaveLength(1);
        const reasoning = report.findings[0].reasoning;
        expect(reasoning).toBeDefined();
        expect(reasoning?.what[0]).toContain('Refactored logic');
        expect(reasoning?.why).toContain('old stuff');
    });

    it('should handle findings without reasoning gracefully', async () => {
        mockOllama.mockResponse = JSON.stringify({
            summary: { overallQuality: "good", message: "ok" },
            findings: [{
                category: "bug",
                severity: "warning",
                title: "Bug 1",
                description: "Desc",
                location: { fileName: "t.ts", startLine: 1, endLine: 1, snippet: "c" }
            }]
        });

        const report = await service.reviewCode([], {
            enabledCategories: [FindingCategory.Bug],
            minSeverity: SeverityLevel.Info,
            includeContext: false
        });

        expect(report.findings[0].reasoning).toBeUndefined();
    });
});
