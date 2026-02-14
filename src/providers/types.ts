export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface Context {
    activeFile?: string;
    selection?: string;
    language?: string;
}

export interface ChatResponse {
    content: string;
    model: string;
    tokensUsed?: number;
}

export interface ReviewComment {
    line: number;
    message: string;
    category: 'readability' | 'syntax' | 'best-practice' | 'improvement';
}

export interface UnifiedDiff {
    original: string;
    modified: string;
    diff: string;
}

export interface AIProvider {
    readonly name: string;
    readonly type: 'online' | 'local';

    isAvailable(): Promise<boolean>;

    chat(messages: Message[], context: Context): Promise<ChatResponse>;
    explain(code: string, context: Context): Promise<string>;
    review(code: string, context: Context): Promise<ReviewComment[]>;
    generateDiff(code: string, instruction: string, context: Context): Promise<UnifiedDiff>;
}

export interface ProviderHealth {
    online: boolean;
    local: boolean;
    active: string;
}
