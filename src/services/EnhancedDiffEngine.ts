import * as vscode from 'vscode';
import { ILLMClient } from '../providers/ILLMClient';

import { LLMRouter } from '../reasoning/LLMRouter';
import { DiffProposal, StructuredResponse } from '../reasoning/types';
import { HunkParser, extractUnifiedDiff } from '../diffUtils';

/** Reasoning built from the model's plain text when it skipped the required sections. */
function rawReasoning(response: string): StructuredResponse {
    const prose = response.replace(/```[\s\S]*?```/g, '').trim();
    return {
        what: ['See the proposed diff.'],
        why: prose || 'The model did not explain this change.',
        improvements: '',
        tradeoffs: '',
        production: ''
    };
}

export class EnhancedDiffEngine {
    constructor(
        private llmClient: ILLMClient,
        private llmRouter: LLMRouter
    ) { }


    /**
     * Generates a diff proposal with structured reasoning based on a user instruction.
     */
    async generateProposal(filePath: string, originalContent: string, instruction: string): Promise<DiffProposal | null> {
        const prompt = this.buildPrompt(filePath, originalContent, instruction);
        const config = vscode.workspace.getConfiguration('orbit');
        // orbit.reasoning.maxRetries: extra attempts when the reply lacks the diff or the reasoning.
        const maxRetries = Math.max(0, config.get<number>('reasoning.maxRetries', 3));
        // orbit.reasoning.fallbackToRaw: keep a valid diff even if the reasoning never parses.
        const fallbackToRaw = config.get<boolean>('reasoning.fallbackToRaw', true);

        let structured: StructuredResponse | null = null;
        let rawDiff: string | null = null;
        let response = '';

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const attemptPrompt = attempt === 0
                ? prompt
                : `${prompt}

Your previous answer was missing the \`\`\`diff block or one of the reasoning sections. Answer again with both.`;
            response = await this.llmClient.generate(attemptPrompt);
            structured = this.llmRouter.transformResponse(response);
            rawDiff = extractUnifiedDiff(response);
            if (structured && rawDiff) {
                break;
            }
        }

        if (!rawDiff) {
            console.error('[EnhancedDiffEngine] Failed to extract unified diff from response');
            return null;
        }

        if (!structured) {
            if (!fallbackToRaw) {
                console.error('[EnhancedDiffEngine] Failed to parse structured reasoning from response');
                return null;
            }
            structured = rawReasoning(response);
        }

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
