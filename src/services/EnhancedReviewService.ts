import { ReviewService } from '../reviewService';
import { ILLMClient } from '../providers/ILLMClient';

import { ContextGatherer } from '../reviewContext';
import {
    ReviewReport,
    ReviewConfig,
    CodeInput,
    Finding,
    ProjectContext
} from '../reviewTypes';
import { LLMRouter } from '../reasoning/LLMRouter';

export class EnhancedReviewService extends ReviewService {
    constructor(
        llmClient: ILLMClient,
        contextGatherer: ContextGatherer,
        config: ReviewConfig,
        private llmRouter: LLMRouter
    ) {
        super(llmClient, contextGatherer, config);
    }


    /**
     * Overrides the base buildPrompt to inject structured reasoning instructions for each finding.
     */
    protected buildPrompt(codeInputs: CodeInput[], context: ProjectContext): string {
        const basePrompt = super.buildPrompt(codeInputs, context);

        const enhancedInstructions = `
CRITICAL: Every finding in the "findings" array MUST include an additional field called "reasoning".
This "reasoning" field must be a string that follows this exact Markdown structure:

### What changed
- [Change 1]
- [Change 2]
### Why
[Detailed explanation of why this finding is important]
### Improvements
[Suggested long-term improvements]
### Tradeoffs
[Tradeoffs of the suggested fix]
### Production Considerations
[Safety/performance considerations for production]
`;
        return basePrompt + "\n" + enhancedInstructions;
    }

    /**
     * Overrides parseResponse to extract and transform the structured reasoning from each finding.
     */
    protected parseResponse(response: string): ReviewReport {
        const report = super.parseResponse(response);

        // Process each finding reached by the base parser
        report.findings = report.findings.map(finding => {
            // The JSON might contain the reasoning as a string property
            const rawReasoning = (finding as any).reasoning;

            if (rawReasoning && typeof rawReasoning === 'string') {
                // Use LLMRouter to transform the raw text into our StructuredResponse object
                const structured = this.llmRouter.transformResponse(rawReasoning);
                if (structured) {
                    finding.reasoning = structured;
                }
            }

            return finding;
        });

        return report;
    }
}
