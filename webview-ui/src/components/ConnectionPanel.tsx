import { useEffect, useState, KeyboardEvent } from 'react';
import { vscode } from '../utilities/vscode';
import { useOrbitStore } from '../store/useOrbitStore';
import { ConnectionMode } from '../types';

type KeyProvider = 'custom' | 'groq' | 'openrouter';

interface ModeOption {
    mode: ConnectionMode;
    name: string;
    icon: string;
    badge: string;
    summary: string;
    keyProvider?: KeyProvider;
    keyLink?: { label: string; url: string };
}

export const MODE_OPTIONS: ModeOption[] = [
    {
        mode: 'cloud', name: 'Cloud (free)', icon: 'codicon-cloud', badge: 'No key',
        summary: 'Works right away with a free shared service. It can be busy at times. Your messages and code are sent to it.'
    },
    {
        mode: 'custom', name: 'OpenAI-compatible', icon: 'codicon-key', badge: 'API key', keyProvider: 'custom',
        summary: 'OpenAI or any service with an OpenAI-style API. Set the endpoint and your key.',
        keyLink: { label: 'Get an OpenAI key', url: 'https://platform.openai.com/api-keys' }
    },
    {
        mode: 'groq', name: 'Groq', icon: 'codicon-zap', badge: 'API key', keyProvider: 'groq',
        summary: 'Very fast hosted open models. Has a free tier.',
        keyLink: { label: 'Get a Groq key', url: 'https://console.groq.com/keys' }
    },
    {
        mode: 'openrouter', name: 'OpenRouter', icon: 'codicon-globe', badge: 'API key', keyProvider: 'openrouter',
        summary: 'One key for many models (GPT, Claude, Llama, Qwen…).',
        keyLink: { label: 'Get an OpenRouter key', url: 'https://openrouter.ai/keys' }
    },
    {
        mode: 'local-server', name: 'Local server', icon: 'codicon-server', badge: 'Private',
        summary: 'LM Studio, Ollama or another OpenAI-compatible server on your machine. Nothing leaves your computer.'
    },
    {
        mode: 'offline', name: 'Offline (built-in)', icon: 'codicon-device-desktop', badge: 'Private',
        summary: 'Runs a model inside VS Code. The first message downloads the runtime and model (several GB). Cannot read images.'
    },
];

export function modeLabel(mode: string | undefined): string {
    return MODE_OPTIONS.find(o => o.mode === mode)?.name ?? 'Choose provider';
}

export function modeIcon(mode: string | undefined): string {
    return MODE_OPTIONS.find(o => o.mode === mode)?.icon ?? 'codicon-plug';
}

/** Saved / replace / remove control for one provider's API key. */
const KeyField = ({ provider, hasKey }: { provider: KeyProvider; hasKey: boolean }) => {
    const [editing, setEditing] = useState(!hasKey);
    const [value, setValue] = useState('');

    useEffect(() => {
        setEditing(!hasKey);
        setValue('');
    }, [hasKey, provider]);

    const save = () => {
        if (!value.trim()) {
            return;
        }
        vscode.postMessage({ type: 'setApiKey', provider, value: value.trim() });
        setValue('');
    };

    if (!editing) {
        return (
            <div className="key-saved">
                <span className="codicon codicon-pass-filled" />
                <span>API key saved (encrypted)</span>
                <button className="link-button" onClick={() => setEditing(true)}>Replace</button>
                <button className="link-button danger" onClick={() => vscode.postMessage({ type: 'clearApiKey', provider })}>Remove</button>
            </div>
        );
    }

    return (
        <div className="field-row">
            <input
                type="password"
                className="text-input"
                placeholder="Paste your API key"
                aria-label="API key"
                value={value}
                autoComplete="off"
                spellCheck={false}
                onChange={e => setValue(e.target.value)}
                onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') { save(); } }}
            />
            <button className="primary-button" onClick={save} disabled={!value.trim()}>Save</button>
            {hasKey && <button className="link-button" onClick={() => setEditing(false)}>Cancel</button>}
        </div>
    );
};

/** Endpoint URL editor for the OpenAI-compatible API and the local server. */
const EndpointField = ({ field, initial, placeholder }: { field: 'custom' | 'localServer'; initial: string; placeholder: string }) => {
    const [value, setValue] = useState(initial);
    useEffect(() => setValue(initial), [initial]);
    const dirty = value.trim() !== initial;
    const save = () => vscode.postMessage({ type: 'setEndpoint', field, value: value.trim() });

    return (
        <div className="field-row">
            <input
                className="text-input mono"
                aria-label="Endpoint URL"
                placeholder={placeholder}
                value={value}
                spellCheck={false}
                onChange={e => setValue(e.target.value)}
                onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' && dirty) { save(); } }}
            />
            <button className="primary-button" onClick={save} disabled={!dirty || !value.trim()}>Save</button>
        </div>
    );
};

export const ConnectionPanel = () => {
    const { connection, setConnectionPanelOpen, connectionTest, testingConnection, setTestingConnection, setConnectionTest, connectionState } = useOrbitStore();

    if (!connection) {
        return (
            <div className="connection-panel">
                <div className="connection-loading"><span className="codicon codicon-loading codicon-modifier-spin" /> Loading provider settings…</div>
            </div>
        );
    }

    const selected = MODE_OPTIONS.find(o => o.mode === connection.mode) ?? MODE_OPTIONS[0];
    const needsKey = !!selected.keyProvider && !connection.hasKey[selected.keyProvider];

    const choose = (mode: ConnectionMode) => {
        if (mode !== connection.mode) {
            setConnectionTest(null);
            vscode.postMessage({ type: 'setMode', value: mode });
        }
    };

    const test = () => {
        setTestingConnection(true);
        vscode.postMessage({ type: 'testConnection' });
    };

    return (
        <div className="connection-panel" role="dialog" aria-label="AI provider">
            <div className="connection-header">
                <span className="connection-title">AI provider</span>
                <button className="icon-button" title="Close" onClick={() => setConnectionPanelOpen(false)}>
                    <span className="codicon codicon-close" />
                </button>
            </div>

            <div className="mode-list" role="radiogroup">
                {MODE_OPTIONS.map(option => {
                    const active = option.mode === connection.mode;
                    const keyMissing = option.keyProvider && !connection.hasKey[option.keyProvider];
                    return (
                        <button
                            key={option.mode}
                            role="radio"
                            aria-checked={active}
                            className={`mode-option ${active ? 'active' : ''}`}
                            onClick={() => choose(option.mode)}
                        >
                            <span className={`codicon ${option.icon} mode-icon`} />
                            <span className="mode-name">{option.name}</span>
                            <span className={`mode-badge ${keyMissing ? 'warn' : ''}`}>
                                {option.keyProvider && !keyMissing ? 'Key saved' : option.badge}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="mode-details">
                <p className="mode-summary">{selected.summary}</p>

                {selected.mode === 'custom' && (
                    <>
                        <label className="field-label">Endpoint</label>
                        <EndpointField field="custom" initial={connection.endpoint} placeholder="https://api.openai.com/v1" />
                    </>
                )}

                {selected.mode === 'local-server' && (
                    <>
                        <label className="field-label">Server URL</label>
                        <EndpointField field="localServer" initial={connection.localServerEndpoint} placeholder="http://localhost:1234/v1" />
                    </>
                )}

                {selected.keyProvider && (
                    <>
                        <label className="field-label">API key</label>
                        <KeyField provider={selected.keyProvider} hasKey={connection.hasKey[selected.keyProvider]} />
                        {selected.keyLink && (
                            <a className="key-link" href={selected.keyLink.url}>
                                {selected.keyLink.label} <span className="codicon codicon-link-external" />
                            </a>
                        )}
                    </>
                )}

                {needsKey && (
                    <div className="connection-note warn">
                        <span className="codicon codicon-warning" /> Add an API key to use {selected.name}.
                    </div>
                )}

                <div className="test-row">
                    <button className="secondary-button" onClick={test} disabled={testingConnection || needsKey}>
                        {testingConnection
                            ? <><span className="codicon codicon-loading codicon-modifier-spin" /> Testing…</>
                            : <><span className="codicon codicon-debug-disconnect" /> Test connection</>}
                    </button>
                    {connectionTest ? (
                        <span className={`test-result ${connectionTest.ok ? 'ok' : 'err'}`}>
                            <span className={`codicon ${connectionTest.ok ? 'codicon-pass-filled' : 'codicon-error'}`} />
                            {connectionTest.message}
                        </span>
                    ) : (
                        <span className="test-result muted">{connectionState}</span>
                    )}
                </div>

                <p className="connection-footnote">
                    Pick the model in the selector under the chat box. Keys are stored in VS Code's encrypted secret storage, not in settings.
                </p>
            </div>
        </div>
    );
};
