import { useEffect, useState } from 'react';

interface FileReferenceIndicatorProps {
    text: string;
}

export const FileReferenceIndicator = ({ text }: FileReferenceIndicatorProps) => {
    const [references, setReferences] = useState<string[]>([]);

    useEffect(() => {
        const refs: string[] = [];
        // Backticks
        const backtickRegex = /`([^`]+)`/g;
        let match;
        while ((match = backtickRegex.exec(text)) !== null) {
            if (match[1].includes('.') || match[1].includes('/') || match[1].includes('\\')) {
                refs.push(match[1]);
            }
        }

        // Hash
        const hashRegex = /#([^\s]+)/g;
        while ((match = hashRegex.exec(text)) !== null) {
            refs.push(match[1]);
        }

        setReferences(refs);
    }, [text]);

    if (references.length === 0) return null;

    return (
        <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            padding: '4px 8px',
            fontSize: '0.8em',
            color: 'var(--vscode-descriptionForeground)'
        }}>
            <span style={{ marginRight: '4px' }}>References:</span>
            {references.map((ref, i) => (
                <span key={i} style={{
                    backgroundColor: 'var(--vscode-badge-background)',
                    color: 'var(--vscode-badge-foreground)',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                }}>
                    <span className="codicon codicon-file"></span>
                    {ref}
                </span>
            ))}
        </div>
    );
};
