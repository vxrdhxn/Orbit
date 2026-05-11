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

    const res = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Online generate failed: HTTP ${res.status} - ${errorText}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
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
    let leftover = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = leftover + decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      leftover = lines.pop() || '';

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
            // Probably a partial line, will be handled by leftover
          }
        }
      }
    }
    return fullResponse;
  }

  public async checkConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch(`${this.endpoint}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      if (res.ok) {
        return { ok: true, message: 'Connected to Online AI ✅' };
      }
      return { ok: false, message: `Online AI returned ${res.status}` };
    } catch (e: any) {
      return { ok: false, message: `Failed to connect to Online AI: ${e.message}` };
    }
  }
}
