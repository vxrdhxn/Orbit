import { CollectedContext, FileContext } from './types';

export class TokenEstimator {
    private readonly CHARS_PER_TOKEN = 4;

    /**
     * Estimates the number of tokens in a string.
     */
    public estimateTokens(text: string): number {
        return Math.ceil(text.length / this.CHARS_PER_TOKEN);
    }

    /**
     * Truncates context to fit within the specified token limit.
     */
    public truncate(context: CollectedContext, maxTokens: number): CollectedContext {
        let currentTokens = this.calculateTotalTokens(context);

        if (currentTokens <= maxTokens) {
            return context;
        }

        // 1. Truncate files from lowest priority
        const sortedFiles = [...context.openFiles].sort((a, b) => a.priority - b.priority);
        const keptFiles: FileContext[] = [];

        // We process from high priority to low
        const highToLow = [...context.openFiles].sort((a, b) => b.priority - a.priority);
        let tokenCount = this.estimateTokens(JSON.stringify(context.fileStructure)) +
            this.estimateTokens(JSON.stringify(context.pastDecisions));

        for (const file of highToLow) {
            const fileTokens = this.estimateTokens(file.content);
            if (tokenCount + fileTokens <= maxTokens) {
                keptFiles.push(file);
                tokenCount += fileTokens;
            } else {
                // If we can't fit the whole file, we might take a chunk if it's high priority
                if (file.priority >= 100) {
                    const remainingSpace = maxTokens - tokenCount;
                    if (remainingSpace > 100) {
                        const truncatedContent = file.content.substring(0, remainingSpace * this.CHARS_PER_TOKEN) + "\n... [TRUNCATED]";
                        keptFiles.push({ ...file, content: truncatedContent });
                        tokenCount += this.estimateTokens(truncatedContent);
                    }
                }
                // Once we hit the limit, we stop adding more files
                break;
            }
        }

        return {
            ...context,
            openFiles: keptFiles,
            totalTokens: tokenCount
        };
    }

    private calculateTotalTokens(context: CollectedContext): number {
        let total = 0;
        for (const file of context.openFiles) {
            total += this.estimateTokens(file.content);
        }
        total += this.estimateTokens(JSON.stringify(context.fileStructure));
        total += this.estimateTokens(JSON.stringify(context.pastDecisions));
        if (context.currentSelection) {
            total += this.estimateTokens(context.currentSelection.content);
        }
        return total;
    }
}
