import * as vscode from 'vscode';

type EmbeddingReq = {
  model: string;
  input: string | string[];
};

type EmbeddingResp = {
  embeddings?: number[] | number[][];
  error?: string;
};

function cfg() {
  const c = vscode.workspace.getConfiguration('orbit');
  return {
    baseUrl: c.get<string>('ollamaEndpoint', 'http://localhost:11434'),
    embeddingModel: c.get<string>('embeddingModel', 'nomic-embed-text'),
  };
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const { baseUrl, embeddingModel } = cfg();
  const body: EmbeddingReq = { model: embeddingModel, input: texts };
  const res = await fetch(`${baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Embeddings failed: HTTP ${res.status}`);
  const json = (await res.json()) as EmbeddingResp;
  if (json.error) throw new Error(json.error);
  // Ollama returns { "embeddings": [[...], [...]] } for array input
  const arr = json.embeddings as number[][];
  if (!Array.isArray(arr)) throw new Error('Unexpected embeddings response.');
  return arr;
}

export async function embedTexts(texts: string[], batchSize = 32): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);
    const vecs = await embedBatch(chunk);
    out.push(...vecs);
  }
  return out;
}

export async function embedOne(text: string): Promise<number[]> {
  const [v] = await embedTexts([text], 1);
  return v;
}
