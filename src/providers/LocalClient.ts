import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { ILLMClient } from './ILLMClient';

let llamaModule: any;
let getLlama: any;

try {
  llamaModule = require('node-llama-cpp');
  getLlama = llamaModule.getLlama;
} catch (e) {
  // Graceful fallback if native module fails to load
  console.error('Failed to load node-llama-cpp:', e);
}

export class LocalClient implements ILLMClient {
  private llama: any;
  private model: any;
  private context: any;
  private session: any;
  private modelPath: string;

  constructor(private modelName: string) {
    this.modelPath = path.join(os.homedir(), '.orbit', 'models', `${modelName}.gguf`);
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
    if (!getLlama) {
      throw new Error('Offline AI module not installed. Please rebuild native modules for Orbit.');
    }

    if (!fs.existsSync(this.modelPath)) {
      await this.downloadModel();
    }

    if (!this.llama) {
      this.llama = await getLlama();
    }
    
    if (!this.model) {
      this.model = await this.llama.loadModel({
        modelPath: this.modelPath
      });
      this.context = await this.model.createContext();
      this.session = new llamaModule.LlamaChatSession({
        contextSequence: this.context.getSequence()
      });
    }
  }

  public async listModels(): Promise<string[]> {
    return [this.modelName];
  }

  public async generate(prompt: string, params?: { model?: string; json?: boolean }): Promise<string> {
    await this.initLlama();
    
    // Simple prompt for now
    const response = await this.session.prompt(prompt);
    return response;
  }

  public async generateStream(prompt: string, onChunk: (chunk: string) => void, signal?: AbortSignal, images?: string[]): Promise<string> {
    await this.initLlama();
    
    let fullResponse = '';
    
    await this.session.prompt(prompt, {
      onTextChunk(text: string) {
        fullResponse += text;
        onChunk(text);
      },
      signal
    });

    return fullResponse;
  }

  public async checkConnection(): Promise<{ ok: boolean; message: string }> {
    if (!getLlama) {
      return { ok: false, message: 'Offline AI module not installed properly.' };
    }
    if (!fs.existsSync(this.modelPath)) {
      return { ok: false, message: `Model not found at ${this.modelPath}.` };
    }
    return { ok: true, message: `Offline AI Ready ✅ (${this.modelName})` };
  }
}
