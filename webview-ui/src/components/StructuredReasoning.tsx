import React from 'react';
import ReactMarkdown from 'react-markdown';
import { CodeBlock } from './CodeBlock';
import { StructuredResponse } from '../types';

interface StructuredReasoningProps {
    reasoning: StructuredResponse;
}

export const StructuredReasoning: React.FC<StructuredReasoningProps> = ({ reasoning }) => {
    return (
        <div className="structured-reasoning" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Section title="What" items={reasoning.what} color="#4fc3f7" />
            <Section title="Why" content={reasoning.why} color="#81c784" />
            <Section title="Improvements" content={reasoning.improvements} color="#ffd54f" />
            <Section title="Trade-offs" content={reasoning.tradeoffs} color="#ba68c8" />
            <Section title="Production" content={reasoning.production} color="#e57373" />
        </div>
    );
};

const Section: React.FC<{ title: string; content?: string; items?: string[]; color: string }> = ({ title, content, items, color }) => {
    const [isCollapsed, setIsCollapsed] = React.useState(false);

    if (!content && (!items || items.length === 0)) return null;

    return (
        <div style={{
            borderLeft: `4px solid ${color}`,
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '4px',
            overflow: 'hidden'
        }}>
            <div
                onClick={() => setIsCollapsed(!isCollapsed)}
                style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontWeight: 600,
                    fontSize: '0.9em',
                    textTransform: 'uppercase',
                    userSelect: 'none'
                }}
            >
                <span>{title}</span>
                <span className={`codicon codicon-chevron-${isCollapsed ? 'right' : 'down'}`}></span>
            </div>

            {!isCollapsed && (
                <div style={{ padding: '0 12px 12px 12px', fontSize: '0.95em', lineHeight: '1.5' }}>
                    {items ? (
                        <ul style={{ margin: 0, paddingLeft: '20px' }}>
                            {items.map((item, i) => (
                                <li key={i}><ReactMarkdown>{item}</ReactMarkdown></li>
                            ))}
                        </ul>
                    ) : (
                        <ReactMarkdown
                            components={{
                                code({ node, className, children, ...props }: any) {
                        const isInline = !node?.properties?.className && 
                            !(node?.position && node?.tagName === 'code' && 
                              node?.parent?.tagName === 'pre');
                        const match = /language-(\w+)/.exec(className || '');
                        
                        if (!isInline && match) {
                            return (
                                <CodeBlock
                                    language={match[1]}
                                    value={String(children).replace(/\n$/, '')}
                                />
                            );
                        }
                        
                        return (
                            <code className={className} {...props} style={{
                                backgroundColor: 'var(--bg-surface)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                color: 'var(--accent-primary)',
                                fontFamily: 'var(--vscode-editor-font-family)',
                                border: '1px solid var(--border-dim)'
                            }}>
                                {children}
                            </code>
                        );
                                }
                            }}
                        >
                            {content || ''}
                        </ReactMarkdown>
                    )}
                </div>
            )}
        </div>
    );
};
