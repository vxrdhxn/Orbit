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

  private async initLlama() {
    if (!getLlama) {
      throw new Error('Offline AI module not installed. Please rebuild native modules for Orbit.');
    }

    if (!fs.existsSync(this.modelPath)) {
      throw new Error(`Model not found at ${this.modelPath}. Please download ${this.modelName}.gguf to this location.`);
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
