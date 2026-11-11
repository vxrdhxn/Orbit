export interface ILLMClient {
    generate(prompt: string, params?: { model?: string; json?: boolean }): Promise<string>;
    generateStream(prompt: string, onChunk: (chunk: string) => void, signal?: AbortSignal, images?: string[]): Promise<string>;
    checkConnection(): Promise<{ ok: boolean; message: string; canBootstrap?: boolean }>;
    listModels(): Promise<string[]>;
}

/** Builds the user message, attaching images (data URLs) in OpenAI vision format. */
export function buildUserContent(prompt: string, images?: string[]): any {
  if (!images || images.length === 0) {
    return prompt;
  }
  return [
    { type: 'text', text: prompt },
    ...images.map(url => ({ type: 'image_url', image_url: { url } })),
  ];
}
