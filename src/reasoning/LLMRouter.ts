import { StructuredResponse, LLMRouterConfig } from './types';
import { ResponseFormatter } from './ResponseFormatter';

export class LLMRouter {
    private formatter: ResponseFormatter;
    private config: LLMRouterConfig;

    constructor(formatter: ResponseFormatter, config: LLMRouterConfig) {
        this.formatter = formatter;
        this.config = config;
    }

    /**
     * Transforms a raw LLM output string into a StructuredResponse.
     * Uses regex and heuristics to extract sections.
     */
    public transformResponse(rawText: string): StructuredResponse | null {
        // First temporarily isolate code blocks so we don't accidentally match headers inside code
        const { processedText, codeBlocks } = this.formatter.extractCodeBlocks(rawText);

        const response: Partial<StructuredResponse> = {
            what: [],
            why: '',
            improvements: '',
            tradeoffs: '',
            production: ''
        };

        // Improved regexes to match sections in slightly varying formats
        // Matches e.g. "### What changed", "What:", "**What:**", etc.
        const sectionsMatch = {
            what: /(?:^|\n)\s*(?:#{2,3}\s*)?(?:\*\*)?What(?:\s+changed)?(?:\*\*)?\s*:?\s*\n?([\s\S]*?)(?=(?:^|\n)\s*(?:#{2,3}\s*)?(?:\*\*)?(?:Why|Improvements|Tradeoffs|Production(?:\s+Considerations)?)(?:\*\*)?\s*:?\s*(?:\n|$)|$)/i,

            why: /(?:^|\n)\s*(?:#{2,3}\s*)?(?:\*\*)?Why(?:\*\*)?\s*:?\s*\n?([\s\S]*?)(?=(?:^|\n)\s*(?:#{2,3}\s*)?(?:\*\*)?(?:What(?:\s+changed)?|Improvements|Tradeoffs|Production(?:\s+Considerations)?)(?:\*\*)?\s*:?\s*(?:\n|$)|$)/i,

            improvements: /(?:^|\n)\s*(?:#{2,3}\s*)?(?:\*\*)?Improvements(?:\*\*)?\s*:?\s*\n?([\s\S]*?)(?=(?:^|\n)\s*(?:#{2,3}\s*)?(?:\*\*)?(?:What(?:\s+changed)?|Why|Tradeoffs|Production(?:\s+Considerations)?)(?:\*\*)?\s*:?\s*(?:\n|$)|$)/i,

            tradeoffs: /(?:^|\n)\s*(?:#{2,3}\s*)?(?:\*\*)?Tradeoffs(?:\*\*)?\s*:?\s*\n?([\s\S]*?)(?=(?:^|\n)\s*(?:#{2,3}\s*)?(?:\*\*)?(?:What(?:\s+changed)?|Why|Improvements|Production(?:\s+Considerations)?)(?:\*\*)?\s*:?\s*(?:\n|$)|$)/i,

            production: /(?:^|\n)\s*(?:#{2,3}\s*)?(?:\*\*)?Production(?:\s+Considerations)?(?:\*\*)?\s*:?\s*\n?([\s\S]*?)(?=(?:^|\n)\s*(?:#{2,3}\s*)?(?:\*\*)?(?:What(?:\s+changed)?|Why|Improvements|Tradeoffs)(?:\*\*)?\s*:?\s*(?:\n|$)|$)/i
        };

        // Extract "what changed" as an array (usually a bulleted list)
        const whatMatch = processedText.match(sectionsMatch.what);
        if (whatMatch && whatMatch[1]) {
            const whatContent = this.formatter.restoreCodeBlocks(whatMatch[1], codeBlocks);
            response.what = whatContent.split('\n')
                .map(line => line.replace(/^[\s\-\*\d\.]+/, '').trim())
                .filter(line => line.length > 0);
        }

        const whyMatch = processedText.match(sectionsMatch.why);
        if (whyMatch && whyMatch[1]) {
            response.why = this.formatter.restoreCodeBlocks(whyMatch[1], codeBlocks).trim();
        }

        const improvementsMatch = processedText.match(sectionsMatch.improvements);
        if (improvementsMatch && improvementsMatch[1]) {
            response.improvements = this.formatter.restoreCodeBlocks(improvementsMatch[1], codeBlocks).trim();
        }

        const tradeoffsMatch = processedText.match(sectionsMatch.tradeoffs);
        if (tradeoffsMatch && tradeoffsMatch[1]) {
            response.tradeoffs = this.formatter.restoreCodeBlocks(tradeoffsMatch[1], codeBlocks).trim();
        }

        const productionMatch = processedText.match(sectionsMatch.production);
        if (productionMatch && productionMatch[1]) {
            response.production = this.formatter.restoreCodeBlocks(productionMatch[1], codeBlocks).trim();
        }

        // Apply heuristic post-processing if sections are missing
        this.applyHeuristics(processedText, response, codeBlocks);

        const validation = this.formatter.validate(response);
        if (validation.isValid) {
            return response as StructuredResponse;
        }

        return null;
    }

    /**
     * Fallback heuristics if regexes fail to find exact section names.
     */
    private applyHeuristics(processedText: string, response: Partial<StructuredResponse>, codeBlocks: Map<string, string>): void {
        const fullText = this.formatter.restoreCodeBlocks(processedText, codeBlocks);

        // If the LLM completely ignored the structure and just returned a big block of text,
        // we might not enforce format strictly, or we can try to guess.
        if (response.what?.length === 0 && !response.why && !response.improvements && !response.tradeoffs && !response.production) {
            // Assume the whole thing is the "what" and "why" blended together.
            response.why = fullText.trim();
            // Just satisfy the "what" with a summary
            response.what = ["Refactored or updated code based on instructions."];
        }

        // Fill out empty sections with defaults if heuristic recovery is enabled
        // (This would depend on strictness, if enforceFormat is false, we can inject defaults)
        if (!this.config.enforceFormat) {
            if (!response.why) {response.why = "Reasoning was not explicitly provided by the AI.";}
            if (!response.improvements) {response.improvements = "No further improvements noted.";}
            if (!response.tradeoffs) {response.tradeoffs = "No specific tradeoffs mentioned.";}
            if (!response.production) {response.production = "Review standard production guidelines.";}
            if (response.what?.length === 0) {response.what = ["Code updated."];}
        }
    }

    /**
     * Formats the prompt to ensure the LLM returns the expected structure.
     */
    public appendStructuredInstructions(prompt: string): string {
        const instructions = `
You must format your response with the following exact headings:
### What changed
- (Bulleted list of changes)
### Why
(Your detailed reasoning)
### Improvements
(Potential future improvements)
### Tradeoffs
(Any tradeoffs made here)
### Production Considerations
(What to consider before shipping this)
`;
        return prompt + '\n\n' + instructions;
    }

}
