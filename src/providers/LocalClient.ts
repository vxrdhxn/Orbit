import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { ILLMClient } from './ILLMClient';
import { Worker } from 'worker_threads';

export class LocalClient implements ILLMClient {
  private modelPath: string;
  private worker: Worker | null = null;
  private msgIdCounter = 0;
  private pendingMessages = new Map<number, { resolve: (val: any) => void, reject: (err: any) => void, onChunk?: (chunk: string) => void }>();

  constructor(private modelName: string) {
    this.modelPath = path.join(os.homedir(), '.orbit', 'models', `${modelName}.gguf`);
  }

  private getWorker(): Worker {
    if (!this.worker) {
        this.worker = new Worker(path.join(__dirname, 'worker.js'));
        this.worker.on('message', (msg) => {
            const handlers = this.pendingMessages.get(msg.id);
            if (handlers) {
                if (msg.error) {
                    this.pendingMessages.delete(msg.id);
                    handlers.reject(new Error(msg.error));
                } else if (msg.chunk !== undefined) {
                    if (handlers.onChunk) {
                        handlers.onChunk(msg.chunk);
                    }
                } else {
                    this.pendingMessages.delete(msg.id);
                    handlers.resolve(msg.result);
                }
            }
        });
        this.worker.on('error', (err) => {
            for (const [id, handlers] of this.pendingMessages.entries()) {
                handlers.reject(err);
            }
            this.pendingMessages.clear();
            this.worker = null;
        });
    }
    return this.worker;
  }

  private async downloadModel() {
    let url = '';
    if (this.modelName.toLowerCase().includes('qwen2.5-coder-7b')) {
      url = 'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf?download=true';
    } else {
      throw new Error(`Automatic download not supported for model: ${this.modelName}. Please download it manually to ${this.modelPath}`);
    }

    const dir = path.dirname(this.modelPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Orbit: Downloading offline model ${this.modelName}... (This may take a while)`,
      cancellable: true
    }, async (progress, token) => {
      return new Promise<void>((resolve, reject) => {
        const file = fs.createWriteStream(this.modelPath);
        
        token.onCancellationRequested(() => {
          file.close();
          if (fs.existsSync(this.modelPath)) { fs.unlinkSync(this.modelPath); }
          reject(new Error('Download cancelled'));
        });

        const https = require('https');
        
        const request = (downloadUrl: string) => {
          https.get(downloadUrl, (response: any) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
              return request(response.headers.location);
            }
            if (response.statusCode !== 200) {
              reject(new Error(`Failed to download: ${response.statusCode}`));
              return;
            }
            
            const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
            let downloadedBytes = 0;
            
            response.on('data', (chunk: any) => {
              if (token.isCancellationRequested) {
                response.destroy();
                return;
              }
              downloadedBytes += chunk.length;
              const percentage = totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
              const downloadedMB = (downloadedBytes / 1024 / 1024).toFixed(1);
              const totalMB = totalBytes ? (totalBytes / 1024 / 1024).toFixed(1) : 'Unknown';
              progress.report({ 
                message: `${downloadedMB} MB / ${totalMB} MB (${percentage}%)`
              });
            });
            
            response.pipe(file);
            
            file.on('finish', () => {
              file.close();
              resolve();
            });
          }).on('error', (err: any) => {
            file.close();
            if (fs.existsSync(this.modelPath)) { fs.unlinkSync(this.modelPath); }
            reject(err);
          });
        };
        
        request(url);
      });
    });
  }

  private async initLlama() {
    if (!fs.existsSync(this.modelPath)) {
      await this.downloadModel();
    }

    const w = this.getWorker();
    const id = ++this.msgIdCounter;
    await new Promise((resolve, reject) => {
        this.pendingMessages.set(id, { resolve, reject });
        w.postMessage({ type: 'init', id, modelPath: this.modelPath });
    });
  }

  public async listModels(): Promise<string[]> {
    return [this.modelName];
  }

  public async generate(prompt: string, params?: { model?: string; json?: boolean }): Promise<string> {
    await this.initLlama();
    const w = this.getWorker();
    const id = ++this.msgIdCounter;
    return new Promise((resolve, reject) => {
        this.pendingMessages.set(id, { resolve, reject });
        w.postMessage({ type: 'generate', id, prompt });
    });
  }

  public async generateStream(prompt: string, onChunk: (chunk: string) => void, signal?: AbortSignal, images?: string[]): Promise<string> {
    await this.initLlama();
    const w = this.getWorker();
    const id = ++this.msgIdCounter;
    
    // Support abortion if token is triggered
    if (signal) {
        signal.addEventListener('abort', () => {
            // Note: worker abortion not fully supported in this simple IPC,
            // we'd need to send an abort message to the worker.
        });
    }

    return new Promise((resolve, reject) => {
        this.pendingMessages.set(id, { resolve, reject, onChunk });
        w.postMessage({ type: 'generateStream', id, prompt });
    });
  }

  public async checkConnection(): Promise<{ ok: boolean; message: string; canBootstrap?: boolean }> {
    if (!fs.existsSync(this.modelPath)) {
      return {
        ok: false,
        canBootstrap: true,
        message: `Model not found at ${this.modelPath}. It will download when you send a message.`
      };
    }
    return { ok: true, message: `Offline AI Ready ✅ (${this.modelName})` };
  }
}
