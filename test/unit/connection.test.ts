import * as vscode from 'vscode';
import { ApiKeyStore } from '../../src/providers/ApiKeyStore';
import { ChatProvider, modelSettingFor } from '../../src/ChatProvider';
import { SmartClient } from '../../src/providers/SmartClient';

/** In-memory stand-in for VS Code's SecretStorage. */
function fakeSecrets() {
    const data = new Map<string, string>();
    return {
        data,
        get: jest.fn(async (k: string) => data.get(k)),
        store: jest.fn(async (k: string, v: string) => { data.set(k, v); }),
        delete: jest.fn(async (k: string) => { data.delete(k); }),
    } as any;
}

/** Settings stand-in that records updates. */
function fakeConfig(values: Record<string, any> = {}) {
    const store = { ...values };
    const config = {
        get: jest.fn((k: string, d?: any) => (k in store ? store[k] : d)),
        update: jest.fn(async (k: string, v: any) => { if (v === undefined) { delete store[k]; } else { store[k] = v; } }),
        inspect: jest.fn((k: string) => ({ globalValue: store[k] })),
    };
    (vscode.workspace.getConfiguration as jest.Mock).mockImplementation(() => config);
    return { config, store };
}

afterEach(() => {
    (vscode.workspace.getConfiguration as jest.Mock).mockImplementation(() => ({ get: jest.fn((_k: string, d: any) => d) }));
});

describe('ApiKeyStore', () => {
    it('stores keys in Secret Storage and reads them back after a restart', async () => {
        fakeConfig();
        const secrets = fakeSecrets();
        await new ApiKeyStore(secrets).set('groq', '  gsk_123  ');

        const reloaded = new ApiKeyStore(secrets);
        await reloaded.load();

        expect(reloaded.get('groq')).toBe('gsk_123');
        expect(reloaded.has('openrouter')).toBe(false);
    });

    it('keeps old keys from settings working and removes the plain-text copy when a key is saved', async () => {
        const { store } = fakeConfig({ onlineApiKey: 'sk-old' });
        const keys = new ApiKeyStore(fakeSecrets());
        expect(keys.get('custom')).toBe('sk-old');

        await keys.set('custom', 'sk-new');

        expect(keys.get('custom')).toBe('sk-new');
        expect(store.onlineApiKey).toBeUndefined();
    });

    it('feeds the saved key to the model client', async () => {
        fakeConfig({ mode: 'openrouter' });
        const keys = new ApiKeyStore(fakeSecrets());
        await keys.set('openrouter', 'or-key');

        const client: any = (new SmartClient(keys) as any).getClient();

        expect(client.apiKey).toBe('or-key');
        expect(client.endpoint).toContain('openrouter.ai');
    });
});

describe('modelSettingFor', () => {
    it('saves the chosen model where each mode reads it', () => {
        expect(modelSettingFor('offline')).toBe('offlineModel');
        expect(modelSettingFor('local-server')).toBe('localServerModel');
        expect(modelSettingFor('groq')).toBe('onlineModel');
        expect(modelSettingFor('openrouter')).toBe('onlineModel');
        expect(modelSettingFor('cloud')).toBe('onlineModel');
    });
});

describe('ChatProvider connection panel', () => {
    const context: any = {
        globalState: { get: jest.fn().mockReturnValue([]), update: jest.fn() },
        workspaceState: { get: jest.fn().mockReturnValue([]), update: jest.fn() },
        subscriptions: [],
    };

    it('reports which providers have keys, never the keys themselves', async () => {
        fakeConfig({ mode: 'groq' });
        const keys = new ApiKeyStore(fakeSecrets());
        await keys.set('groq', 'super-secret');
        const provider: any = new ChatProvider(context, {} as any, undefined, keys);
        const webview = { postMessage: jest.fn() };

        await provider._handleConnectionMessage({ type: 'getConnection' }, webview);

        const info = webview.postMessage.mock.calls[0][0];
        expect(info.type).toBe('connectionInfo');
        expect(info.value.mode).toBe('groq');
        expect(info.value.hasKey).toEqual({ custom: false, groq: true, openrouter: false });
        expect(JSON.stringify(info)).not.toContain('super-secret');
    });

    it('switches the mode and saves keys from the chat', async () => {
        const { store } = fakeConfig({ mode: 'cloud' });
        const keys = new ApiKeyStore(fakeSecrets());
        const provider: any = new ChatProvider(context, {} as any, undefined, keys);
        const webview = { postMessage: jest.fn() };

        await provider._handleConnectionMessage({ type: 'setMode', value: 'groq' }, webview);
        await provider._handleConnectionMessage({ type: 'setApiKey', provider: 'groq', value: 'gsk_abc' }, webview);

        expect(store.mode).toBe('groq');
        expect(keys.get('groq')).toBe('gsk_abc');
    });

    it('rejects unknown modes and invalid endpoint URLs', async () => {
        const { store } = fakeConfig({ mode: 'cloud' });
        const provider: any = new ChatProvider(context, {} as any, undefined, new ApiKeyStore(fakeSecrets()));
        const webview = { postMessage: jest.fn() };

        await provider._handleConnectionMessage({ type: 'setMode', value: 'not-a-mode' }, webview);
        await provider._handleConnectionMessage({ type: 'setEndpoint', field: 'custom', value: 'javascript:alert(1)' }, webview);

        expect(store.mode).toBe('cloud');
        expect(store.onlineApiEndpoint).toBeUndefined();
        expect(webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'connectionTestResult', value: expect.objectContaining({ ok: false }) }));
    });

    it('tests the connection on request', async () => {
        fakeConfig({ mode: 'cloud' });
        const llm: any = { checkConnection: jest.fn().mockResolvedValue({ ok: true, message: 'Ready' }), listModels: jest.fn().mockResolvedValue([]) };
        const provider: any = new ChatProvider(context, llm, undefined, new ApiKeyStore(fakeSecrets()));
        const webview = { postMessage: jest.fn() };

        await provider._handleConnectionMessage({ type: 'testConnection' }, webview);

        expect(webview.postMessage).toHaveBeenCalledWith({ type: 'connectionTestResult', value: { ok: true, message: 'Ready' } });
    });
});
