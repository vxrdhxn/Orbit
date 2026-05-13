import * as vscode from 'vscode';
import { ILLMClient } from './providers/ILLMClient';

// ---- Types for Ollama endpoints ----
type OllamaTagsResponse = {
  models?: Array<{ name: string }>;
};

type GenerateReq = {
  model: string;
  prompt: string;
  images?: string[];
  stream?: boolean;
  format?: string;
  options?: { temperature?: number; top_p?: number };
};

type GenerateResp = { response?: string; done?: boolean; error?: string };

// ---- Read config from VS Code settings ----
function cfg() {
  const c = vscode.workspace.getConfiguration('orbit');
  return {
    baseUrl: c.get<string>('ollamaEndpoint', 'http://localhost:11434'),
    model: c.get<string>('ollamaModel', 'qwen2.5-coder:7b'),
    temperature: c.get<number>('temperature', 0.2),
  };
}

export class OllamaClient implements ILLMClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    if (baseUrl) {
      this.baseUrl = baseUrl;
    } else {
      const { baseUrl: configUrl } = cfg();
      this.baseUrl = configUrl;
    }
  }

  public async listModels(): Promise<string[]> {
    console.log(`[OllamaClient] listModels called, baseUrl: ${this.baseUrl}`);
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) throw new Error(`Ollama not reachable at ${this.baseUrl}`);
      const json = (await res.json()) as OllamaTagsResponse;
      return (json.models ?? []).map((m) => m.name);
    } catch (e) {
      console.error('[OllamaClient] listModels failed:', e);
      throw e;
    }
  }

  public async generate(prompt: string, params?: { model?: string; json?: boolean }): Promise<string> {
    const { model: configModel, temperature } = cfg();
    const model = params?.model || configModel;

    const body: GenerateReq = {
      model,
      prompt,
      stream: false,
      options: { temperature }
    };

    if (params?.json) {
      body.format = 'json';
    }

    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Generate failed: HTTP ${res.status}`);

    const json = (await res.json()) as GenerateResp;
    if (json.error) throw new Error(json.error);

    return json.response ?? '';
  }

  public async generateStream(prompt: string, onChunk: (chunk: string) => void, signal?: AbortSignal, images?: string[]): Promise<string> {
    const { model, temperature } = cfg();
    const body: GenerateReq = { 
      model, 
      prompt, 
      images, 
      stream: true, 
      options: { temperature } 
    };

    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) throw new Error(`Generate failed: HTTP ${res.status}`);
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
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        let json: GenerateResp;
        try {
          json = JSON.parse(trimmed) as GenerateResp;
        } catch (e) {
          console.error('Error parsing JSON chunk', e, trimmed);
          continue;
        }

        if (json.error) throw new Error(json.error);
        if (json.done) break;
        if (json.response) {
          onChunk(json.response);
          fullResponse += json.response;
        }
      }
    }
    return fullResponse;
  }

  public async checkConnection(): Promise<{ ok: boolean; message: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { method: 'GET', signal: controller.signal });
      if (!res.ok) {
        return { ok: false, message: `Ollama server at ${this.baseUrl} returned error ${res.status}.` };
      }
      return { ok: true, message: 'Connected to Ollama ✅' };
    } catch (e: any) {
      if (e.name === 'AbortError') return { ok: false, message: 'Connection timed out.' };
      return { ok: false, message: `Ollama server not reached at ${this.baseUrl}. Please ensure Ollama is running.` };
    } finally {
      clearTimeout(timeout);
    }
  }
}

// Legacy exports for compatibility during refactoring
export async function listModels(): Promise<string[]> {
  return new OllamaClient().listModels();
}

export async function generate(prompt: string, onChunk?: (chunk: string) => void, signal?: AbortSignal, images?: string[]): Promise<string> {
  const client = new OllamaClient();
  if (onChunk) {
    return client.generateStream(prompt, onChunk, signal, images);
  } else {
    return client.generate(prompt);
  }
}
