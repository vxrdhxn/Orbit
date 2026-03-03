import { AIProvider, Message, Context, ChatResponse, ReviewComment, UnifiedDiff } from './types';
import { LLMRouter } from '../reasoning/LLMRouter';
import { ResponseFormatter } from '../reasoning/ResponseFormatter';

export class StructuredProvider implements AIProvider {
    private provider: AIProvider;
    private router: LLMRouter;
    private formatter: ResponseFormatter;
    private maxRetries: number;

    constructor(provider: AIProvider, router: LLMRouter, formatter: ResponseFormatter, maxRetries: number = 2) {
        this.provider = provider;
        this.router = router;
        this.formatter = formatter;
        this.maxRetries = maxRetries;
    }

    get name(): string {
        return `Structured(${this.provider.name})`;
    }

    get type(): 'online' | 'local' {
        return this.provider.type;
    }

    public async isAvailable(): Promise<boolean> {
        return this.provider.isAvailable();
    }

    /**
     * Executes an operation with retry logic for structured reasoning.
     */
    private async executeWithRetries<T>(
        operation: (retryPrompt?: string) => Promise<string>,
        onSuccess: (structuredContent: string, rawText: string) => T,
        rawFallback: (rawText: string) => T
    ): Promise<T> {
        let attempts = 0;
        let retryPrompt: string | undefined = undefined;
        let lastRawText = '';

        while (attempts <= this.maxRetries) {
            attempts++;

            // 1. Get raw string from provider
            const rawText = await operation(retryPrompt);
            lastRawText = rawText;

            // 2. Transform into structured reasoning
            const structuredResponse = this.router.transformResponse(rawText);

            if (structuredResponse) {
                // Formatting it to Markdown for the standard AIProvider return type
                const markdown = this.formatter.renderMarkdown(structuredResponse);
                return onSuccess(markdown, rawText);
            }

            // If we failed validation, prepare the retry prompt (if not maxed out)
            if (attempts <= this.maxRetries) {
                retryPrompt = "Your previous response was missing required structured sections (What changed, Why, Improvements, Tradeoffs, Production Considerations). Please regenerate the response strictly following the required headers.";
            }
        }

        // Fallback to raw text
        return rawFallback(lastRawText);
    }

    public async chat(messages: Message[], context: Context): Promise<ChatResponse> {
        const enhancedMessages = [...messages];
        // Enhance the prompt of the latest user message
        if (enhancedMessages.length > 0) {
            const lastObj = enhancedMessages[enhancedMessages.length - 1];
            if (lastObj.role === 'user') {
                lastObj.content = this.router.appendStructuredInstructions(lastObj.content);
            }
        }

        return this.executeWithRetries(
            async (retryPrompt) => {
                const msgsToSent = [...enhancedMessages];
                if (retryPrompt) {
                    msgsToSent.push({ role: 'user', content: retryPrompt });
                }
                const response = await this.provider.chat(msgsToSent, context);
                return response.content;
            },
            (structuredContent) => ({ content: structuredContent, model: this.provider.name }),
            (rawText) => ({ content: rawText, model: this.provider.name })
        );
    }

    public async explain(code: string, context: Context): Promise<string> {
        const instructionPrompt = this.router.appendStructuredInstructions(`Please explain the following code:\n\n${code}`);

        return this.executeWithRetries(
            async (retryPrompt) => {
                // If the provider supports direct instructions in explain, we could pass it.
                // Assuming provider.explain just takes the code and context.
                // But wait, the standard provider explain might not accept instructions directly.
                // We'll simulate by wrapping it in a chat call if needed, but if we strictly use the original explain:
                // We can't easily change the explain prompt unless the underlying provider supports it.
                // For now, let's just use chat to get the explanation with instruction, because the base interface doesn't allow prompt tweaking for explain.
                const messages: Message[] = [
                    { role: 'system', content: 'You are an AI code explainer.' },
                    { role: 'user', content: retryPrompt ? `${instructionPrompt}\n\n${retryPrompt}` : instructionPrompt }
                ];
                const response = await this.provider.chat(messages, context);
                return response.content;
            },
            (structuredContent) => structuredContent,
            (rawText) => rawText
        );
    }

    public async review(code: string, context: Context): Promise<ReviewComment[]> {
        // Review needs to return ReviewComment[].
        // Structured reasoning is usually markdown, but ReviewComment is an object.
        // Wait, Phase 3 task 13 says: "Extend existing ReviewService with structured reasoning... Transform existing Finding objects to include StructuredResponse".
        // For now, in Phase 1, we still need to return ReviewComment[].
        // If we strictly follow Phase 1 requirement 4.1 "Delegate all AIProvider interface methods",
        // maybe review doesn't return markdown strings, it returns ReviewComment[] as before.
        // This means StructuredProvider might just passthrough `review` for now until Phase 3.
        return this.provider.review(code, context);
    }

    public async generateDiff(code: string, instruction: string, context: Context): Promise<UnifiedDiff> {
        // Similar to review, generateDiff returns UnifiedDiff.
        // In Phase 4, "Generate DiffProposal objects with reasoning".
        // For Phase 1, we simply passthrough or embed the reasoning in the diff result?
        // Let's passthrough for now, since Phase 4 explicitly changes diff engine.
        return this.provider.generateDiff(code, instruction, context);
    }
}
