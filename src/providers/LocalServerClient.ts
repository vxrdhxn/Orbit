import * as vscode from 'vscode';
import { ILLMClient } from './ILLMClient';

export class LocalServerClient implements ILLMClient {
  constructor(private endpoint: string, private modelName: string) {}

  public async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.endpoint}/models`);
      if (!res.ok) { return [this.modelName]; }
      const data: any = await res.json();
      return data.data?.map((m: any) => m.id) || [this.modelName];
    } catch {
      return [this.modelName];
    }
  }

  public async generate(prompt: string, params?: { model?: string; json?: boolean }): Promise<string> {
    const model = params?.model || this.modelName;

    const body: any = {
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    };

    if (params?.json) {
      body.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // Allow more time for local inference

    try {
      const res = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`LocalServer generate failed: HTTP ${res.status} - ${errorText}`);
      }
      const data: any = await res.json();
      return data.choices[0].message.content;
    } finally {
      clearTimeout(timeout);
    }
  }

  public async generateStream(prompt: string, onChunk: (chunk: string) => void, signal?: AbortSignal, images?: string[]): Promise<string> {
    const model = this.modelName;

    const body = {
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    };

    const res = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`LocalServer stream failed: HTTP ${res.status} - ${errorText}`);
    }
    if (!res.body) { throw new Error('No response body'); }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) { break; }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last partial line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') { continue; }
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const content = json.choices[0]?.delta?.content;
            if (content) {
              fullResponse += content;
              onChunk(content);
            }
          } catch (e) {
            console.warn('Failed to parse stream JSON chunk:', trimmed);
          }
        }
      }
    }
    return fullResponse;
  }

  public async checkConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.endpoint) {
      return { ok: false, message: 'Local server endpoint not configured.' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`${this.endpoint}/models`, {
        method: 'GET',
        signal: controller.signal
      });

      if (res.ok) {
        return { ok: true, message: 'Local Inference Server is Ready ✅' };
      }
      return { ok: false, message: `Local server returned ${res.status}` };
    } catch (e: any) {
      return { ok: false, message: `Local server unreachable: ${e.message}` };
    } finally {
      clearTimeout(timeout);
    }
  }
}
