import * as vscode from 'vscode';

import { Worker } from 'worker_threads';
import * as path from 'path';

let worker: Worker | null = null;
let msgIdCounter = 0;
const pendingMessages = new Map<number, { resolve: (val: any) => void, reject: (err: any) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(path.join(__dirname, 'embeddingsWorker.js'));
    worker.on('message', (msg) => {
      if (msg.type === 'ready') return;
      const handlers = pendingMessages.get(msg.id);
      if (handlers) {
        pendingMessages.delete(msg.id);
        if (msg.error) {
          handlers.reject(new Error(msg.error));
        } else {
          handlers.resolve(msg.result);
        }
      }
    });
    worker.on('error', (err) => {
      console.error('Embeddings worker error:', err);
      // Reject all pending messages
      for (const [id, handlers] of pendingMessages.entries()) {
        handlers.reject(err);
      }
      pendingMessages.clear();
      worker = null;
    });
  }
  return worker;
}

async function embedOffline(texts: string[]): Promise<number[][]> {
  const w = getWorker();
  const id = ++msgIdCounter;
  const config = vscode.workspace.getConfiguration('orbit');
  const model = config.get<string>('embedding.model', 'Xenova/all-MiniLM-L6-v2');

  return new Promise((resolve, reject) => {
    pendingMessages.set(id, { resolve, reject });
    w.postMessage({ type: 'embed', id, texts, model });
  });
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
  if (!res.ok) {throw new Error(`Embeddings failed: HTTP ${res.status}`);}
  const json: any = await res.json();
  if (json.error) {throw new Error(json.error.message || json.error);}
  
  return json.data.map((d: any) => d.embedding);
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const c = vscode.workspace.getConfiguration('orbit');
  const mode = c.get<string>('mode', 'cloud');
  const apiKey = c.get<string>('onlineApiKey', '');
  
  // Use online embeddings ONLY if custom mode is selected and an API key is provided
  if (mode === 'custom' && apiKey) {
    return await embedOnline(texts);
  } else {
    return await embedOffline(texts);
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
