export interface ILLMClient {
    generate(prompt: string, params?: { model?: string; json?: boolean }): Promise<string>;
    generateStream(prompt: string, onChunk: (chunk: string) => void, signal?: AbortSignal, images?: string[]): Promise<string>;
    checkConnection(): Promise<{ ok: boolean; message: string }>;
    listModels(): Promise<string[]>;
}
