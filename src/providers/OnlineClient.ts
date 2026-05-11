import * as vscode from 'vscode';
import { ILLMClient } from './ILLMClient';

export class OnlineClient implements ILLMClient {
  constructor(private endpoint: string, private apiKey: string) {}

  public async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.endpoint}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      if (!res.ok) return ['gpt-4', 'gpt-4o', 'gpt-3.5-turbo'];
      const data = await res.json();
      return data.data?.map((m: any) => m.id) || [];
    } catch {
      return ['gpt-4', 'gpt-4o', 'gpt-3.5-turbo'];
    }
  }

  public async generate(prompt: string, params?: { model?: string; json?: boolean }): Promise<string> {
    const config = vscode.workspace.getConfiguration('orbit');
    const model = params?.model || config.get<string>('onlineModel', 'gpt-4o');

    const body: any = {
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    };

    if (params?.json) {
      body.response_format = { type: 'json_object' };
    }

    // 30s timeout by default
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Online generate failed: HTTP ${res.status} - ${errorText}`);
      }
      const data = await res.json();
      return data.choices[0].message.content;
    } finally {
      clearTimeout(timeout);
    }
  }

  public async generateStream(prompt: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
    const config = vscode.workspace.getConfiguration('orbit');
    const model = config.get<string>('onlineModel', 'gpt-4o');

    const body = {
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    };

    const res = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Online stream failed: HTTP ${res.status} - ${errorText}`);
    }
    if (!res.body) throw new Error('No response body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last partial line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const content = json.choices[0]?.delta?.content;
            if (content) {
              onChunk(content);
              fullResponse += content;
            }
          } catch (e) {
            // If parsing fails, it might be a split line across chunks.
            // We'll prepend 'data: ' back to buffer for the next chunk.
            buffer = line + '\n' + buffer;
          }
        }
      }
    }
    return fullResponse;
  }

  public async checkConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.endpoint || !this.apiKey) {
      return { ok: false, message: 'Online AI not configured. Please set endpoint and API key in settings.' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`${this.endpoint}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        signal: controller.signal
      });

      if (res.ok) {
        return { ok: true, message: 'Online AI is Ready ✅' };
      }
      return { ok: false, message: `Online AI returned ${res.status}` };
    } catch (e: any) {
      return { ok: false, message: `Online AI unreachable: ${e.message}` };
    } finally {
      clearTimeout(timeout);
    }
  }
}
