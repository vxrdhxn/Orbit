import * as vscode from 'vscode';
import { ILLMClient } from './ILLMClient';
import { OllamaClient } from '../ollamaClient';
import { OnlineClient } from './OnlineClient';

export class SmartClient implements ILLMClient {
  private getClient(): ILLMClient {
    const config = vscode.workspace.getConfiguration('orbit');
    const preferOnline = config.get<boolean>('preferOnline', false);

    if (preferOnline) {
      const endpoint = config.get<string>('onlineApiEndpoint', '');
      const apiKey = config.get<string>('onlineApiKey', '');
      return new OnlineClient(endpoint, apiKey);
    } else {
      const endpoint = config.get<string>('ollamaEndpoint', 'http://localhost:11434');
      return new OllamaClient(endpoint);
    }
  }

  public async generate(prompt: string, params?: { model?: string; json?: boolean }): Promise<string> {
    try {
      return await this.getClient().generate(prompt, params);
    } catch (e: any) {
      const config = vscode.workspace.getConfiguration('orbit');
      const preferOnline = config.get<boolean>('preferOnline', false);
      if (preferOnline) {
        console.warn(`[SmartClient] Online AI failed (${e.message || e}), falling back to local Ollama...`);
        const endpoint = config.get<string>('ollamaEndpoint', 'http://localhost:11434');
        return new OllamaClient(endpoint).generate(prompt, params);
      }
      throw e;
    }
  }

  public async generateStream(prompt: string, onChunk: (chunk: string) => void, signal?: AbortSignal, images?: string[]): Promise<string> {
    try {
      return await this.getClient().generateStream(prompt, onChunk, signal, images);
    } catch (e: any) {
      const config = vscode.workspace.getConfiguration('orbit');
      const preferOnline = config.get<boolean>('preferOnline', false);
      if (preferOnline) {
        console.warn(`[SmartClient] Online AI stream failed (${e.message || e}), falling back to local Ollama...`);
        const endpoint = config.get<string>('ollamaEndpoint', 'http://localhost:11434');
        return new OllamaClient(endpoint).generateStream(prompt, onChunk, signal, images);
      }
      throw e;
    }
  }

  public async checkConnection(): Promise<{ ok: boolean; message: string }> {
    const client = this.getClient();
    const result = await client.checkConnection();
    
    // If online connection fails, also check local to provide a better status
    if (!result.ok && client instanceof OnlineClient) {
        const config = vscode.workspace.getConfiguration('orbit');
        const ollamaEndpoint = config.get<string>('ollamaEndpoint', 'http://localhost:11434');
        const local = new OllamaClient(ollamaEndpoint);
        const localStatus = await local.checkConnection();
        return { 
            ok: localStatus.ok, 
            message: `Online failed (${result.message}). Local is ${localStatus.ok ? 'Ready ✅' : 'Unreachable ❌'}`
        };
    }
    return result;
  }

  public async listModels(): Promise<string[]> {
    try {
      return await this.getClient().listModels();
    } catch {
      return [];
    }
  }
}
