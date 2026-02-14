import { AIProvider, ChatResponse, Context, Message, ReviewComment, UnifiedDiff } from './types';

export class LocalProvider implements AIProvider {
    readonly name = 'Local Ollama';
    readonly type = 'local';

    constructor(
        private endpoint: string,
        private model: string = 'codellama'
    ) { }

    async isAvailable(): Promise<boolean> {
        try {
            const response = await fetch(`${this.endpoint}/api/tags`);
            return response.ok;
        } catch {
            return false;
        }
    }

    async chat(messages: Message[], context: Context): Promise<ChatResponse> {
        const prompt = this.formatMessages(messages, context);

        // Using generate endpoint for raw completion or chat endpoint if available
        // Here using /api/generate as it's often simpler for Ollama v1
        const response = await fetch(`${this.endpoint}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                prompt: prompt,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama failed: ${response.statusText}`);
        }

        const data = await response.json();
        return {
            content: data.response,
            model: this.model
        };
    }

    private formatMessages(messages: Message[], context: Context): string {
        let prompt = '';

        // System context
        if (context.activeFile) {
            prompt += `File: ${context.activeFile}\n\n`;
        }
        if (context.selection) {
            prompt += `Selected code:\n${context.selection}\n\n`;
        }

        // Chat history
        for (const msg of messages) {
            prompt += `${msg.role}: ${msg.content}\n`;
        }

        return prompt;
    }

    async explain(code: string, context: Context): Promise<string> {
        const messages: Message[] = [{ role: 'user', content: `Explain the following code:\n${code}` }];
        const response = await this.chat(messages, context);
        return response.content;
    }

    async review(code: string, context: Context): Promise<ReviewComment[]> {
        return [];
    }

    async generateDiff(code: string, instruction: string, context: Context): Promise<UnifiedDiff> {
        return {
            original: code,
            modified: code,
            diff: ''
        };
    }
}
