import * as vscode from 'vscode';
import { OllamaClient } from '../ollamaClient';
import { LLMRouter } from '../reasoning/LLMRouter';
import { DiffProposal } from '../reasoning/types';
import { HunkParser, extractUnifiedDiff } from '../diffUtils';

export class EnhancedDiffEngine {
    constructor(
        private ollamaClient: OllamaClient,
        private llmRouter: LLMRouter
    ) { }

    /**
     * Generates a diff proposal with structured reasoning based on a user instruction.
     */
    async generateProposal(filePath: string, originalContent: string, instruction: string): Promise<DiffProposal | null> {
        const prompt = this.buildPrompt(filePath, originalContent, instruction);

        // We use json: false because we want the LLM to output a mix of Markdown and Diff
        const model = vscode.workspace.getConfiguration('orbit').get<string>('ollamaModel', 'codellama');
        const response = await this.ollamaClient.generate(prompt, {
            model: model
        });

        // 1. Extract reasoning using LLMRouter
        const structured = this.llmRouter.transformResponse(response);
        if (!structured) {
            console.error('[EnhancedDiffEngine] Failed to parse structured reasoning from response');
            return null;
        }

        // 2. Extract unified diff
        const rawDiff = extractUnifiedDiff(response);
        if (!rawDiff) {
            console.error('[EnhancedDiffEngine] Failed to extract unified diff from response');
            return null;
        }

        // 3. Parse into hunks
        const hunks = HunkParser.parse(rawDiff);

        return {
            id: Math.random().toString(36).substring(7),
            fileName: filePath,
            fullDiff: rawDiff,
            hunks: hunks,
            reasoning: structured,
            timestamp: Date.now()
        };
    }

    private buildPrompt(filePath: string, content: string, instruction: string): string {
        return `
You are a precise code editor. Apply the user instruction to the given file and output a standard UNIX unified diff followed by structured reasoning.

FILE: ${filePath}
INSTRUCTION: ${instruction}

ORIGINAL CONTENT:
\`\`\`
${content}
\`\`\`

OUTPUT FORMAT:
Your response MUST include two main parts:
1. A unified diff in a \`\`\`diff\`\`\` block.
2. Structured reasoning using the following sections:

### What changed
- [List specific changes]
### Why
[Explain the rationale]
### Improvements
[Suggested follow-up improvements]
### Tradeoffs
[Analyze any tradeoffs made]
### Production Considerations
[Assessment of production safety/performance]

Now, apply the instruction and output the diff and reasoning.
`;
    }
}
