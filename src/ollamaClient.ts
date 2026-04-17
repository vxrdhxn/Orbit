import * as vscode from 'vscode';

// ---- Types for Ollama endpoints ----
type OllamaTagsResponse = {
  models?: Array<{ name: string }>;
};

type GenerateReq = {
  model: string;
  prompt: string;
  images?: string[];
  stream?: boolean;
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

// ---- Ollama helpers ----
export async function listModels(): Promise<string[]> {
  const { baseUrl } = cfg();
  console.log(`[ollamaClient] listModels called, baseUrl: ${baseUrl}`);
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    console.log(`[ollamaClient] fetch response status: ${res.status}`);
    if (!res.ok) throw new Error(`Ollama not reachable at ${baseUrl}`);
    const json = (await res.json()) as OllamaTagsResponse;
    console.log(`[ollamaClient] models found: ${json.models?.length}`);
    return (json.models ?? []).map((m) => m.name);
  } catch (e) {
    console.error('[ollamaClient] listModels failed:', e);
    throw e;
  }
}

export async function modelExists(name: string) {
  const models = await listModels();
  return models.includes(name);
}

export async function generate(prompt: string, onChunk?: (chunk: string) => void, signal?: AbortSignal, images?: string[]): Promise<string> {
  const { baseUrl, model, temperature } = cfg();
  const body: GenerateReq = { model, prompt, images, stream: !!onChunk, options: { temperature } };
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) throw new Error(`Generate failed: HTTP ${res.status}`);

  if (!onChunk) {
    // Non-streaming behavior
    const json = (await res.json()) as GenerateResp;
    if (json.error) throw new Error(json.error);
    return json.response ?? '';
  }

  // Streaming behavior
  if (!res.body) throw new Error('No response body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    // Ollama sends multiple JSON objects in one chunk sometimes
    const lines = chunk.split('\n').filter(l => l.trim() !== '');
    for (const line of lines) {
      try {
        const json = JSON.parse(line) as GenerateResp;
        if (json.error) throw new Error(json.error);
        if (json.done) break;
        if (json.response) {
          onChunk(json.response);
          fullResponse += json.response;
        }
      } catch (e) {
        console.error('Error parsing JSON chunk', e);
      }
    }
  }
  return fullResponse;
}

export async function healthCheck(): Promise<{ ok: boolean; message: string }> {
  try {
    const { model } = cfg();
    await listModels();
    const exists = await modelExists(model);
    if (!exists) {
      return { ok: false, message: `Model "${model}" not found. Run:  ollama pull ${model}` };
    }
    const resp = await generate('Say "ready".');
    const ok = /ready/i.test(resp);
    return { ok, message: ok ? 'Ollama is ready ✅' : 'Ollama responded, but not as expected.' };
  } catch (e: any) {
    return { ok: false, message: `Health check failed: ${e?.message ?? e}` };
  }
}

export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    if (baseUrl) {
      this.baseUrl = baseUrl;
    } else {
      const { baseUrl: configUrl } = cfg();
      this.baseUrl = configUrl;
    }
  }

  public async generate(prompt: string, params?: { model?: string; json?: boolean }): Promise<string> {
    // Use provided model or config default
    const { model: configModel, temperature } = cfg();
    const model = params?.model || configModel;

    // Construct body
    // Note: The standalone generate function supports streaming and images.
    // This class method supports the simple use case needed by ReviewService (JSON, no images, non-stream for now or stream internally).
    // ReviewService currently waits for full response (non-streaming in MVP logic).

    const body: GenerateReq = {
      model,
      prompt,
      stream: false,
      options: { temperature }
    };

    if (params?.json) {
      // Ollama supports format: 'json'
      (body as any).format = 'json';
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
  public async checkConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { method: 'GET' });
      if (!res.ok) {
        return { ok: false, message: `Ollama server at ${this.baseUrl} returned error ${res.status}.` };
      }
      return { ok: true, message: 'Connected to Ollama ✅' };
    } catch (e: any) {
      if (e.name === 'AbortError') return { ok: false, message: 'Connection timed out.' };
      return { ok: false, message: `Ollama server not reached at ${this.baseUrl}. Please ensure Ollama is running.` };
    }
  }
}
