import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { vscode } from '@/utilities/vscode';

interface CodeBlockProps {
    language: string;
    value: string;
}

export const CodeBlock = ({ language, value }: CodeBlockProps) => {
    const handleCopy = () => {
        vscode.postMessage({ type: 'copyCode', value });
    };

    const handleInsert = () => {
        vscode.postMessage({ type: 'insertCode', value });
    };

    const handleApply = () => {
        vscode.postMessage({ type: 'applyCode', value, language });
    };

    return (
        <div className="code-block" style={{ margin: '8px 0', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--vscode-widget-border)' }}>
            <div className="code-header" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 8px',
                backgroundColor: 'var(--vscode-editor-lineHighlightBackground)',
                borderBottom: '1px solid var(--vscode-widget-border)',
                fontSize: '0.85em'
            }}>
                <span className="lang-label" style={{ opacity: 0.7 }}>{language}</span>
                <div className="code-actions" style={{ display: 'flex', gap: '4px' }}>
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
                </div>
            </div>
            <SyntaxHighlighter
                language={language}
                style={vscDarkPlus}
                customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.9em' }}
            >
                {value}
            </SyntaxHighlighter>
        </div>
    );
};
