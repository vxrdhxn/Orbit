import * as assert from 'assert';
import * as vscode from 'vscode';
import { ChatProvider } from '../../ChatProvider';
import { ILLMClient } from '../../providers/ILLMClient';

class MockLLMClient implements ILLMClient {
  public isConnected = true;
  public canBootstrap = false;
  async generate(prompt: string, params?: { model?: string; json?: boolean }): Promise<string> {
    return "This is a mock AI response";
  }
  async generateStream(prompt: string, onChunk: (chunk: string) => void, signal?: AbortSignal, images?: string[]): Promise<string> {
    onChunk("This is a mock AI response");
    return "This is a mock AI response";
  }
  async checkConnection(): Promise<{ ok: boolean; message: string; canBootstrap?: boolean }> {
    return {
      ok: this.isConnected,
      canBootstrap: this.canBootstrap,
      message: this.isConnected ? 'Connected' : 'Offline model not installed'
    };
  }
  async listModels(): Promise<string[]> {
    return ['mock-model'];
  }
}

class MockWebview implements vscode.Webview {
  public html = '';
  public options: vscode.WebviewOptions = {};
  public cspSource = '';
  
  private messageHandlers: ((message: any) => any)[] = [];
  public postedMessages: any[] = [];

  onDidReceiveMessage = (listener: (e: any) => any, thisArgs?: any, disposables?: vscode.Disposable[]): vscode.Disposable => {
    this.messageHandlers.push(listener.bind(thisArgs));
    return { dispose: () => {} };
  };

  postMessage(message: any): Thenable<boolean> {
    this.postedMessages.push(message);
    return Promise.resolve(true);
  }

  asWebviewUri(localResource: vscode.Uri): vscode.Uri {
    return localResource;
  }

  public simulateMessageReceive(message: any) {
    for (const handler of this.messageHandlers) {
      handler(message);
    }
  }
}

class MockWebviewView implements vscode.WebviewView {
  public readonly webview = new MockWebview();
  public readonly viewType = 'orbit.chatView';
  public readonly title = 'Orbit';
  public readonly description = '';
  public badge?: vscode.ViewBadge | undefined;

  public show(preserveFocus?: boolean): void {}
  private _onDidChangeVisibility = new vscode.EventEmitter<void>();
  public readonly onDidChangeVisibility = this._onDidChangeVisibility.event;
  public visible = true;
  private _onDidDispose = new vscode.EventEmitter<void>();
  public readonly onDidDispose = this._onDidDispose.event;
}

suite('ChatProvider IPC E2E Test Suite', () => {
  let chatProvider: ChatProvider;
  let mockClient: MockLLMClient;
  let mockContext: vscode.ExtensionContext;
  let mockWebviewView: MockWebviewView;

  setup(async () => {
    mockClient = new MockLLMClient();
    
    // Create a mock context
    mockContext = {
      extensionUri: vscode.Uri.file(__dirname),
      globalState: {
        get: (key: string, def?: any) => def,
        update: (key: string, val: any) => Promise.resolve(),
      } as any,
      workspaceState: {
        get: (key: string, def?: any) => def,
        update: (key: string, val: any) => Promise.resolve(),
      } as any,
      secrets: {} as any,
      extensionPath: __dirname,
      storageUri: vscode.Uri.file(__dirname),
      globalStorageUri: vscode.Uri.file(__dirname),
    } as vscode.ExtensionContext;

    chatProvider = new ChatProvider(mockContext, mockClient);
    mockWebviewView = new MockWebviewView();
  });

  test('IPC: Handles newChat message correctly', async () => {
    chatProvider.resolveWebviewView(mockWebviewView as any, {} as any, {} as any);
    
    mockWebviewView.webview.simulateMessageReceive({ type: 'newChat' });
    
    // It should have posted clearChat back
    const clearChatMsg = mockWebviewView.webview.postedMessages.find(m => m.type === 'clearChat');
    assert.ok(clearChatMsg, 'Should send clearChat message to webview');
  });

  test('IPC: Handles sendMessage correctly with mock LLM', async () => {
    chatProvider.resolveWebviewView(mockWebviewView as any, {} as any, {} as any);
    
    // Clear initial messages from resolution
    mockWebviewView.webview.postedMessages = [];

    // Send a message
    mockWebviewView.webview.simulateMessageReceive({ type: 'sendMessage', value: 'Hello' });
    
    // Give it a tick to process async LLM stream
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const statusMsg = mockWebviewView.webview.postedMessages.find(m => m.type === 'status' && m.value === 'Initializing...');
    assert.ok(statusMsg, 'Should send Initializing status');

    const chunkMsg = mockWebviewView.webview.postedMessages.find(m => m.type === 'addResponseChunk');
    assert.ok(chunkMsg, 'Should send response chunks');
    assert.strictEqual(chunkMsg.value, 'This is a mock AI response', 'Should match mock LLM output');
  });

  test('IPC: Allows an offline model to bootstrap on the first message', async () => {
    mockClient.isConnected = false;
    mockClient.canBootstrap = true;
    chatProvider.resolveWebviewView(mockWebviewView as any, {} as any, {} as any);
    mockWebviewView.webview.postedMessages = [];

    mockWebviewView.webview.simulateMessageReceive({ type: 'sendMessage', value: 'Hello' });
    await new Promise(resolve => setTimeout(resolve, 50));

    const errorMessage = mockWebviewView.webview.postedMessages.find(m =>
      m.type === 'addResponse' && String(m.value).includes('Connection Error'));
    const chunkMessage = mockWebviewView.webview.postedMessages.find(m => m.type === 'addResponseChunk');
    assert.strictEqual(errorMessage, undefined, 'A bootstrap-capable offline model should not be blocked');
    assert.ok(chunkMessage, 'Should start generation so LocalClient can download the model');
  });
});
