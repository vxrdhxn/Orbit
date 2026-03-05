import { AIProvider, ChatResponse, Context, Message, ReviewComment, UnifiedDiff } from './types';

export class OnlineProvider implements AIProvider {
    readonly name = 'Online Cloud';
    readonly type = 'online';

    constructor(private endpoint: string, private apiKey: string) { }

    async isAvailable(): Promise<boolean> {
        if (!this.endpoint || !this.apiKey) {
            return false;
        }
        try {
            if (this.endpoint.includes('localhost') || this.endpoint.includes('127.0.0.1')) {
                return true;
            }
            const response = await fetch(`${this.endpoint}/health`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.apiKey}` }
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    async chat(messages: Message[], context: Context): Promise<ChatResponse> {
        const response = await fetch(`${this.endpoint}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: this.createSystemPrompt(context) },
                    ...messages
                ],
                model: 'gpt-4'
            })
        });

        if (!response.ok) {
            throw new Error(`Online provider failed with status ${response.status}. Please check your configuration.`);
        }

        const data = await response.json();
        return {
            content: data.choices[0].message.content,
            model: data.model,
            tokensUsed: data.usage?.total_tokens
        };
    }

    private createSystemPrompt(context: Context): string {
        let prompt = 'You are Orbit, an AI coding assistant.\n';
        if (context.activeFile) {
            prompt += `Active File:\n${context.activeFile}\n`;
        }
        if (context.selection) {
            prompt += `Selected Code:\n${context.selection}\n`;
        }
        return prompt;
    }

    async explain(code: string, context: Context): Promise<string> {
        const messages: Message[] = [{ role: 'user', content: `Explain this code:\n${code}` }];
        const response = await this.chat(messages, context);
        return response.content;
    }

    async review(code: string, context: Context): Promise<ReviewComment[]> {
        // TODO: Implement proper JSON parsing for review comments
        return [];
    }

    async generateDiff(code: string, instruction: string, context: Context): Promise<UnifiedDiff> {
        // TODO: Implement diff generation
        return {
            original: code,
            modified: code,
            diff: ''
        };
    }
}
