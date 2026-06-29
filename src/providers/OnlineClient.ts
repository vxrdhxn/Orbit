import * as vscode from 'vscode';
import { ILLMClient } from './ILLMClient';

// Global Mutex to prevent Pollinations 429s (1 concurrent request max per IP)
let pollinationsMutex = Promise.resolve();

async function withPollinationsMutex<T>(isPollinations: boolean, task: () => Promise<T>): Promise<T> {
  if (!isPollinations) {
    return await task();
  }
  
  const current = pollinationsMutex;
  let resolveMutex: () => void;
  pollinationsMutex = new Promise<void>(r => resolveMutex = r);
  
  // Wait for the previous request to finish, regardless of success/fail
  await current.catch(() => {});
  
  try {
    return await task();
  } finally {
    resolveMutex!();
  }
}

// List of fallback unauthenticated endpoints
const FREE_POOL = [
  'https://text.pollinations.ai/openai',
  'https://api.airforce' // Known free OpenAI-compatible API
];

export class OnlineClient implements ILLMClient {
  constructor(private endpoint: string, private apiKey: string) {}

  public async listModels(): Promise<string[]> {
    try {
      if (this.endpoint.includes('pollinations.ai')) {
        return ['openai', 'mistral', 'mistral-large', 'llama', 'qwen', 'search'];
      }

      const res = await fetch(`${this.endpoint}/models`, {
        headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}
      });
      if (!res.ok) {return ['gpt-4', 'gpt-4o', 'gpt-3.5-turbo'];}
      const data: any = await res.json();
      return data.data?.map((m: any) => m.id) || [];
    } catch {
      return ['gpt-4', 'gpt-4o', 'gpt-3.5-turbo'];
    }
  }

  private async fetchWithFallback(urlPath: string, options: RequestInit, isStream: boolean): Promise<Response> {
    const isDefaultFreeTier = this.endpoint.includes('pollinations.ai') && !this.apiKey;
    const endpointsToTry = isDefaultFreeTier ? FREE_POOL : [this.endpoint];

    for (let i = 0; i < endpointsToTry.length; i++) {
      const currentEndpoint = endpointsToTry[i];
      const isPollinations = currentEndpoint.includes('pollinations.ai');
      
      try {
        const res = await withPollinationsMutex(isPollinations, async () => {
          return await fetch(`${currentEndpoint}${urlPath}`, {
            ...options,
            headers: {
              ...options.headers,
              ...(this.apiKey && !isDefaultFreeTier ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
            }
          });
        });

        if (res.ok) {
          return res;
        }

        if (res.status === 429 && isDefaultFreeTier && i < endpointsToTry.length - 1) {
          console.warn(`Endpoint ${currentEndpoint} returned 429, falling back to next provider...`);
          continue; // Try next endpoint
        }

        // If it's the last endpoint or not a 429, throw error
        const errorText = await res.text();
        let friendlyError = errorText;
        if (res.status === 429 && isPollinations) {
          friendlyError = "The free cloud tier is currently busy (rate limited). Please wait a moment and try again, or configure a Custom API key in settings for unlimited access.";
        }
        throw new Error(`HTTP ${res.status} - ${friendlyError}`);

      } catch (err: any) {
        if (isDefaultFreeTier && i < endpointsToTry.length - 1) {
          console.warn(`Endpoint ${currentEndpoint} failed (${err.message}), falling back...`);
          continue;
        }
        throw err;
      }
    }
    throw new Error('All fallback providers failed.');
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
      const res = await this.fetchWithFallback('/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      }, false);

      const data: any = await res.json();
      return data.choices[0].message.content;
    } catch (err: any) {
      throw new Error(`Online generate failed: ${err.message}`);
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

    try {
      const res = await this.fetchWithFallback('/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      }, true);

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
              if (json.error) {
                throw new Error(json.error.message || JSON.stringify(json.error));
              }
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                onChunk(content);
              }
            } catch (e: any) {
              if (e.message && !e.message.includes('Unexpected token') && !e.message.includes('JSON')) {
                throw e; // Rethrow actual API errors
              }
              console.warn('Failed to parse stream JSON chunk:', trimmed);
            }
          }
        }
      }
      return fullResponse;
    } catch (err: any) {
      throw new Error(`Online stream failed: ${err.message}`);
    }
  }

  public async checkConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.endpoint) {
      return { ok: false, message: 'Online AI endpoint not configured.' };
    }
    
    if (!this.apiKey && !this.endpoint.includes('pollinations.ai')) {
      return { ok: false, message: 'API key is missing for custom endpoint.' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      if (this.endpoint.includes('pollinations.ai')) {
        return { ok: true, message: 'Free Cloud AI is Ready ✅' };
      }

      const res = await fetch(`${this.endpoint}/models`, {
        method: 'GET',
        headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {},
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
