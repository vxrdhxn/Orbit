import * as vscode from 'vscode';

let extractor: any;

async function embedOffline(texts: string[]): Promise<number[][]> {
  if (!extractor) {
    try {
      const transformers = require('@xenova/transformers');
      // allow fetching the model from huggingface
      transformers.env.allowLocalModels = false; 
      extractor = await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    } catch (e) {
      console.error('Failed to load @xenova/transformers', e);
      throw new Error('Offline embeddings require @xenova/transformers to be installed.');
    }
  }
  
  const results = await extractor(texts, { pooling: 'mean', normalize: true });
  return results.tolist();
}

function getOnlineConfig() {
  const c = vscode.workspace.getConfiguration('orbit');
  const mode = c.get<string>('mode', 'cloud');
  if (mode === 'cloud') {
    return {
      baseUrl: 'https://api.orbit-ai.com/v1',
      apiKey: '',
      model: 'text-embedding-3-small'
    };
  } else {
    return {
      baseUrl: c.get<string>('onlineApiEndpoint', 'https://api.orbit-ai.com/v1'),
      apiKey: c.get<string>('onlineApiKey', ''),
      model: 'text-embedding-3-small'
    };
  }
}

async function embedOnline(texts: string[]): Promise<number[][]> {
  const { baseUrl, apiKey, model } = getOnlineConfig();
  const res = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) throw new Error(`Embeddings failed: HTTP ${res.status}`);
  const json: any = await res.json();
  if (json.error) throw new Error(json.error.message || json.error);
  
  return json.data.map((d: any) => d.embedding);
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const c = vscode.workspace.getConfiguration('orbit');
  const mode = c.get<string>('mode', 'cloud');
  
  if (mode === 'offline') {
    return await embedOffline(texts);
  } else {
    return await embedOnline(texts);
  }
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
