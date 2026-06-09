import * as vscode from 'vscode';
import { ILLMClient } from './ILLMClient';
import { OnlineClient } from './OnlineClient';
import { LocalClient } from './LocalClient';
import { LocalServerClient } from './LocalServerClient';

export class SmartClient implements ILLMClient {
  private getClient(): ILLMClient {
    const config = vscode.workspace.getConfiguration('orbit');
    const mode = config.get<string>('mode', 'cloud');

    if (mode === 'cloud') {
      // Mode 1: Cloud Default (Free Models)
      const defaultEndpoint = 'https://text.pollinations.ai/openai';
      return new OnlineClient(defaultEndpoint, '');
    } else if (mode === 'custom') {
      // Mode 2: Custom API Token
      const endpoint = config.get<string>('onlineApiEndpoint', 'https://api.orbit-ai.com/v1');
      const apiKey = config.get<string>('onlineApiKey', '');
      return new OnlineClient(endpoint, apiKey);
    } else if (mode === 'local-server') {
      // Mode 4: Local Server Execution (LM Studio/vLLM)
      const endpoint = config.get<string>('localServerEndpoint', 'http://localhost:1234/v1');
      const model = config.get<string>('localServerModel', 'local-model');
      return new LocalServerClient(endpoint, model);
    } else if (mode === 'groq') {
      const apiKey = config.get<string>('groqApiKey', '');
      return new OnlineClient('https://api.groq.com/openai/v1', apiKey);
    } else if (mode === 'openrouter') {
      const apiKey = config.get<string>('openRouterApiKey', '');
      return new OnlineClient('https://openrouter.ai/api/v1', apiKey);
    } else {
      // Mode 3: Offline Local Execution
      const model = config.get<string>('offlineModel', 'Qwen2.5-Coder-7B');
      return new LocalClient(model);
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
