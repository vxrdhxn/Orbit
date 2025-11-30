import * as vscode from 'vscode';

// ---- Types for Ollama endpoints ----
type OllamaTagsResponse = {
  models?: Array<{ name: string }>;
};

type GenerateReq = {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: { temperature?: number; top_p?: number };
};

type GenerateResp = { response?: string; done?: boolean; error?: string };

// ---- Read config from VS Code settings ----
function cfg() {
  const c = vscode.workspace.getConfiguration('offlineDevAssistant');
  return {
    baseUrl: c.get<string>('ollamaBaseUrl', 'http://127.0.0.1:11434'),
    model: c.get<string>('model', 'qwen2.5-coder:7b'),
    temperature: c.get<number>('temperature', 0.2),
  };
}

// ---- Ollama helpers ----
export async function listModels(): Promise<string[]> {
  const { baseUrl } = cfg();
  const res = await fetch(`${baseUrl}/api/tags`);
  if (!res.ok) throw new Error(`Ollama not reachable at ${baseUrl}`);
  const json = (await res.json()) as OllamaTagsResponse; // <-- narrow unknown → typed
  return (json.models ?? []).map((m) => m.name);
}

export async function modelExists(name: string) {
  const models = await listModels();
  return models.includes(name);
}

export async function generate(prompt: string, signal?: AbortSignal): Promise<string> {
  const { baseUrl, model, temperature } = cfg();
  const body: GenerateReq = { model, prompt, stream: false, options: { temperature } };
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`Generate failed: HTTP ${res.status}`);
  const json = (await res.json()) as GenerateResp; // <-- narrow here too
  if (json.error) throw new Error(json.error);
  return json.response ?? '';
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
