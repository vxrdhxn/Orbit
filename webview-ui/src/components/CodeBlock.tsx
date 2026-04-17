import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { vscode } from '@/utilities/vscode';

interface CodeBlockProps {
    language: string;
    value: string;
}

const TERMINAL_LANGS = new Set(['bash', 'shell', 'sh', 'powershell', 'cmd', 'bat', 'zsh', 'terminal', 'console']);

export const CodeBlock = ({ language, value }: CodeBlockProps) => {
    // Parse language:filepath format (e.g., "typescript:src/utils.ts")
    let lang = language;
    let filePath: string | undefined;
    if (language.includes(':')) {
        const idx = language.indexOf(':');
        lang = language.slice(0, idx);
        filePath = language.slice(idx + 1);
    }

    const isTerminal = TERMINAL_LANGS.has(lang);

    const handleCopy = () => {
        vscode.postMessage({ type: 'copyCode', value });
    };

    const handleInsert = () => {
        vscode.postMessage({ type: 'insertCode', value });
    };

    const handleApply = () => {
        vscode.postMessage({ type: 'applyCode', value, language: lang, filePath });
    };

    const handleRun = () => {
        vscode.postMessage({ type: 'runCommand', value });
    };

    return (
        <div className="code-block-container" style={{
            margin: '16px 0',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            border: '1px solid var(--border-base)',
            boxShadow: 'var(--shadow-premium)',
            backgroundColor: 'hsl(220, 15%, 8%)'
        }}>
            <div className="glass" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 12px',
                borderBottom: '1px solid var(--border-dim)',
                background: 'hsla(220, 13%, 18%, 0.4)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="badge badge-primary" style={{ fontSize: '10px', padding: '1px 6px' }}>
                        {lang.toUpperCase()}
                    </span>
                    {filePath && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--vscode-editor-font-family)' }}>
                            {filePath.split(/[/\\]/).pop()}
                        </span>
                    )}
                </div>
                <div className="code-actions" style={{ display: 'flex', gap: '4px' }}>
                    {isTerminal ? (
                        <button
                            onClick={handleRun}
                            title="Run this command (with confirmation)"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 8px',
                                border: '1px solid var(--vscode-charts-green)',
                                borderRadius: '4px',
                                backgroundColor: 'var(--vscode-charts-green)',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '0.85em',
                                fontWeight: 500
                            }}
                        >
                            <span className="codicon codicon-play" style={{ fontSize: '12px' }}></span>
                            Run
                        </button>
                    ) : (
                        <button
                            onClick={handleApply}
                            title="Apply to active file — opens diff for review"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 8px',
                                border: '1px solid var(--vscode-button-background)',
                                borderRadius: '4px',
                                backgroundColor: 'var(--vscode-button-background)',
                                color: 'var(--vscode-button-foreground)',
                                cursor: 'pointer',
                                fontSize: '0.85em',
                                fontWeight: 500
                            }}
                        >
                            <span className="codicon codicon-diff" style={{ fontSize: '12px' }}></span>
                            Apply
                        </button>
                    )}
                    <button
                        onClick={handleCopy}
                        title="Copy Code"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            border: '1px solid var(--vscode-widget-border)',
                            borderRadius: '4px',
                            backgroundColor: 'transparent',
                            color: 'var(--vscode-editor-foreground)',
                            cursor: 'pointer',
                            fontSize: '0.85em'
                        }}
                    >
                        <span className="codicon codicon-copy" style={{ fontSize: '12px' }}></span>
                        Copy
                    </button>
                    {!isTerminal && (
                        <button
                            onClick={handleInsert}
                            title="Insert at Cursor"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 8px',
                                border: '1px solid var(--vscode-widget-border)',
                                borderRadius: '4px',
                                backgroundColor: 'transparent',
                                color: 'var(--vscode-editor-foreground)',
                                cursor: 'pointer',
                                fontSize: '0.85em'
                            }}
                        >
                            <span className="codicon codicon-insert" style={{ fontSize: '12px' }}></span>
                            Insert
                        </button>
                    )}
                </div>
            </div>
            <SyntaxHighlighter
                language={lang}
                style={vscDarkPlus}
                customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.9em' }}
            >
                {value}
            </SyntaxHighlighter>
        </div>
    );
};
