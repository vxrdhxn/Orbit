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

    return (
        <div className="code-block" style={{ margin: '8px 0', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--vscode-widget-border)' }}>
            <div className="code-header" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 8px',
                backgroundColor: 'var(--vscode-editor-lineHighlightBackground)',
                borderBottom: '1px solid var(--vscode-widget-border)',
                fontSize: '0.85em'
            }}>
                <span className="lang-label">{language}</span>
                <div className="code-actions" style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={handleCopy} title="Copy Code">Copy</button>
                    <button onClick={handleInsert} title="Insert at Cursor">Insert</button>
                </div>
            </div>
            <SyntaxHighlighter
                language={language}
                style={vscDarkPlus}
                customStyle={{ margin: 0, borderRadius: 0 }}
            >
                {value}
            </SyntaxHighlighter>
        </div>
    );
};
