import * as vscode from 'vscode';

/** Providers that need an API key. */
export type KeyProvider = 'custom' | 'groq' | 'openrouter';

export const KEY_PROVIDERS: KeyProvider[] = ['custom', 'groq', 'openrouter'];

/** Secret Storage IDs. */
const SECRET_IDS: Record<KeyProvider, string> = {
    custom: 'orbit.apiKey.custom',
    groq: 'orbit.apiKey.groq',
    openrouter: 'orbit.apiKey.openrouter',
};

/** Older versions kept keys in these (plain-text) settings. */
const LEGACY_SETTINGS: Record<KeyProvider, string> = {
    custom: 'onlineApiKey',
    groq: 'groqApiKey',
    openrouter: 'openRouterApiKey',
};

/**
 * API keys, stored in VS Code's encrypted Secret Storage.
 *
 * Keys are cached in memory after load() so the model client can read them
 * synchronously. A key still in the old plain-text setting keeps working;
 * saving a key from the chat moves it into Secret Storage and clears the setting.
 */
export class ApiKeyStore {
    private readonly cache = new Map<KeyProvider, string>();
    private readonly changed = typeof (vscode as any).EventEmitter === 'function'
        ? new vscode.EventEmitter<KeyProvider>()
        : null;
    /** Fires after a key is saved or removed. */
    public readonly onDidChange = this.changed?.event;

    constructor(private readonly secrets?: vscode.SecretStorage) {}

    /** Reads every stored key into memory. Call once on activation. */
    async load(): Promise<void> {
        if (!this.secrets) {
            return;
        }
        for (const provider of KEY_PROVIDERS) {
            try {
                const value = await this.secrets.get(SECRET_IDS[provider]);
                if (value) {
                    this.cache.set(provider, value);
                }
            } catch {
                // Secret Storage unavailable: fall back to the settings.
            }
        }
    }

    /** The key for a provider: from Secret Storage, else the legacy setting, else ''. */
    get(provider: KeyProvider): string {
        return this.cache.get(provider)
            ?? vscode.workspace.getConfiguration('orbit').get<string>(LEGACY_SETTINGS[provider], '')
            ?? '';
    }

    has(provider: KeyProvider): boolean {
        return this.get(provider).trim() !== '';
    }

    async set(provider: KeyProvider, key: string): Promise<void> {
        const trimmed = key.trim();
        if (!trimmed) {
            return this.clear(provider);
        }
        this.cache.set(provider, trimmed);
        await this.secrets?.store(SECRET_IDS[provider], trimmed);
        await this.clearLegacySetting(provider);
        this.changed?.fire(provider);
    }

    async clear(provider: KeyProvider): Promise<void> {
        this.cache.delete(provider);
        await this.secrets?.delete(SECRET_IDS[provider]);
        await this.clearLegacySetting(provider);
        this.changed?.fire(provider);
    }

    /** Removes a plain-text copy of the key from user settings. */
    private async clearLegacySetting(provider: KeyProvider): Promise<void> {
        const config = vscode.workspace.getConfiguration('orbit');
        const inspected = config.inspect?.<string>(LEGACY_SETTINGS[provider]);
        if (inspected?.globalValue) {
            await config.update(LEGACY_SETTINGS[provider], undefined, vscode.ConfigurationTarget.Global);
        }
    }
}
