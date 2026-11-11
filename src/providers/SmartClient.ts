import * as vscode from 'vscode';
import { ILLMClient } from './ILLMClient';
import { OnlineClient } from './OnlineClient';
import { LocalClient } from './LocalClient';
import { LocalServerClient } from './LocalServerClient';

export class SmartClient implements ILLMClient {
  // Reuse one client per configuration. Creating a new LocalClient on every call
  // spawned a fresh worker and reloaded the whole model for every message and
  // every agent step, which made offline chat extremely slow and leaked memory.
  private cachedKey: string | null = null;
  private cachedClient: ILLMClient | null = null;

  private configKey(config: vscode.WorkspaceConfiguration): string {
    return JSON.stringify([
      config.get('mode', 'cloud'),
      config.get('onlineApiEndpoint'),
      config.get('onlineApiKey'),
      config.get('localServerEndpoint'),
      config.get('localServerModel'),
      config.get('groqApiKey'),
      config.get('openRouterApiKey'),
      config.get('offlineModel'),
    ]);
  }

  private getClient(): ILLMClient {
    const config = vscode.workspace.getConfiguration('orbit');
    const key = this.configKey(config);
    if (this.cachedClient && this.cachedKey === key) {
      return this.cachedClient;
    }

    const previous = this.cachedClient;
    this.cachedClient = this.createClient(config);
    this.cachedKey = key;
    // Free the old model's memory when the user switches models or modes.
    (previous as any)?.dispose?.();
    return this.cachedClient;
  }

  public dispose(): void {
    (this.cachedClient as any)?.dispose?.();
    this.cachedClient = null;
    this.cachedKey = null;
  }

  private createClient(config: vscode.WorkspaceConfiguration): ILLMClient {
    const mode = config.get<string>('mode', 'cloud');

    if (mode === 'cloud') {
      // Mode 1: Cloud Default (Free Models)
      const defaultEndpoint = 'https://text.pollinations.ai/openai';
      return new OnlineClient(defaultEndpoint, '');
    } else if (mode === 'custom') {
      // Mode 2: Custom API Token
      const endpoint = config.get<string>('onlineApiEndpoint', 'https://api.openai.com/v1');
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

  private sanitizePrompt(prompt: string): string {
    // Truncate excessively large prompts as a fallback security measure (e.g., 200,000 characters)
    if (prompt.length > 200000) {
        return prompt.substring(0, 200000) + '\n...[TRUNCATED BY SMARTCLIENT TO PREVENT OVERFLOW]';
    }
    // Could also add general system-level overrides here if necessary
    return prompt;
  }

  // Number of chat generations in progress. Chat has priority over background work.
  private activeStreams = 0;

  private isLocalModel(): boolean {
    const mode = vscode.workspace.getConfiguration('orbit').get<string>('mode', 'cloud');
    return mode !== 'cloud' && mode !== 'custom' && mode !== 'groq' && mode !== 'openrouter';
  }

  /** The built-in offline (GGUF) runtime has no vision support. */
  public supportsImages(): boolean {
    const mode = vscode.workspace.getConfiguration('orbit').get<string>('mode', 'cloud');
    return mode !== 'offline';
  }

  public async generate(prompt: string, params?: { model?: string; json?: boolean }): Promise<string> {
    // Background callers (inline completions, Pilot review) must not queue up behind
    // or in front of the chat on a single local model; skip them while chat is busy.
    if (this.activeStreams > 0 && this.isLocalModel()) {
      const error = new Error('Orbit chat is using the local model; skipped background request.');
      error.name = 'AbortError';
      throw error;
    }
    const safePrompt = this.sanitizePrompt(prompt);
    return await this.getClient().generate(safePrompt, params);
  }

  public async generateStream(prompt: string, onChunk: (chunk: string) => void, signal?: AbortSignal, images?: string[]): Promise<string> {
    const safePrompt = this.sanitizePrompt(prompt);
    this.activeStreams++;
    try {
      return await this.getClient().generateStream(safePrompt, onChunk, signal, images);
    } finally {
      this.activeStreams--;
    }
  }

  public async checkConnection(): Promise<{ ok: boolean; message: string; canBootstrap?: boolean }> {
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
