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
      const endpoint = config.get<string>('ollamaEndpoint', 'http://127.0.0.1:11434');
      return new OllamaClient(endpoint);
    }
  }

  public async generate(prompt: string, params?: { model?: string; json?: boolean }): Promise<string> {
    return await this.getClient().generate(prompt, params);
  }

  public async generateStream(prompt: string, onChunk: (chunk: string) => void, signal?: AbortSignal, images?: string[]): Promise<string> {
    return await this.getClient().generateStream(prompt, onChunk, signal, images);
  }

  public async checkConnection(): Promise<{ ok: boolean; message: string }> {
    const client = this.getClient();
    return await client.checkConnection();
  }

  public async listModels(): Promise<string[]> {
    try {
      return await this.getClient().listModels();
    } catch {
      return [];
    }
  }
}
