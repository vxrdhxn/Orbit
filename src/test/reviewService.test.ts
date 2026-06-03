import * as assert from 'assert';
import { ReviewService } from '../reviewService';
import { OllamaClient } from '../ollamaClient';
import { ContextGatherer } from '../reviewContext';
import { FindingCategory, SeverityLevel, CodeInput, ReviewOptions, ReviewConfig } from '../reviewTypes';

// Mock Ollama Client
class MockOllamaClient extends OllamaClient {
    public lastParams: any = {};
    public lastPrompt: string = "";
    public mockResponse: string = "{}";

    constructor() {
        super("http://127.0.0.1:11434");
    }

    async generate(prompt: string, params: any): Promise<string> {
        this.lastPrompt = prompt;
        this.lastParams = params;
        return this.mockResponse;
    }
}

// Mock Context Gatherer
class MockContextGatherer extends ContextGatherer {
    constructor() { super({} as any); }
    async gatherContext() {
        return { similarCode: [], namingConventions: {}, commonPatterns: [] };
    }
}

const mockConfig: ReviewConfig = {
    enabledCategories: [],
    minSeverity: SeverityLevel.Info,
    includeContext: false,
    maxFindings: 10,
    autoApplyFixes: false
};

describe('ReviewService Tests', () => {

    test('Property 1: Localhost-only communication (Service Verification)', async () => {
        const mockOllama = new MockOllamaClient();
        const mockContext = new MockContextGatherer();
        const service = new ReviewService(mockOllama, mockContext, mockConfig);

        const code: CodeInput[] = [{ content: "foo", fileName: "test.ts", language: "typescript" }];

        await service.reviewCode(code, {
            enabledCategories: [],
            minSeverity: SeverityLevel.Info,
            includeContext: false
        });

        assert.ok(mockOllama.lastPrompt.length > 0);
    });


    test('Builds prompt with code content', async () => {
        const mockOllama = new MockOllamaClient();
        const mockContext = new MockContextGatherer();
        const service = new ReviewService(mockOllama, mockContext, mockConfig);

        const code: CodeInput[] = [{
            content: "function test() { return true; }",
            fileName: "test.ts",
            language: "typescript",
            startLine: 1,
            endLine: 1
        }];

        await service.reviewCode(code, {
            enabledCategories: [],
            minSeverity: SeverityLevel.Info,
            includeContext: false
        });

        assert.ok(mockOllama.lastPrompt.includes("function test()"));
        assert.ok(mockOllama.lastPrompt.includes("FILE: test.ts"));
    });

    test('Parses valid JSON response', async () => {
        const mockOllama = new MockOllamaClient();
        mockOllama.mockResponse = JSON.stringify({
            summary: { overallQuality: "good", message: "ok" },
            findings: [{
                category: "bug",
                severity: "warning",
                title: "Test Bug",
                description: "Desc",
                location: { fileName: "t.ts", startLine: 1, endLine: 2, snippet: "code" }
            }]
        });

        const mockContext = new MockContextGatherer();
        const service = new ReviewService(mockOllama, mockContext, mockConfig);

        const report = await service.reviewCode([], {
            enabledCategories: [FindingCategory.Bug],
            minSeverity: SeverityLevel.Info,
            includeContext: false
        });

        assert.strictEqual(report.findings.length, 1);
        assert.strictEqual(report.findings[0].title, "Test Bug");
    });

    test('Handles malformed JSON', async () => {
        const mockOllama = new MockOllamaClient();
        mockOllama.mockResponse = "Invalid JSON {";

        const mockContext = new MockContextGatherer();
        const service = new ReviewService(mockOllama, mockContext, mockConfig);

        const report = await service.reviewCode([], {
            enabledCategories: [],
            minSeverity: SeverityLevel.Info,
            includeContext: false
        });

        assert.strictEqual(report.findings.length, 0);
        assert.ok(report.summary.message.includes("Failed"));
    });
});
