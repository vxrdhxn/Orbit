import ReactMarkdown from 'react-markdown';
import { CodeBlock } from './CodeBlock';
import { StructuredReasoning } from './StructuredReasoning';
import { useEffect, useRef } from 'react';

interface Message {
    role: 'user' | 'ai' | 'system';
    content: string;
    structuredReasoning?: any;
}

interface MessageListProps {
    messages: Message[];
    isGenerating?: boolean;
}

/**
 * Safe markdown renderer — catches render errors from malformed
 * streaming content and falls back to plain text.
 */
const SafeMarkdown = ({ content }: { content: string }) => {
    try {
        return (
            <ReactMarkdown
                components={{
                    code({ node, className, children, ...props }: any) {
                        // react-markdown v9 removed the `inline` prop.
                        // Detect inline code by checking if the parent node is NOT <pre>.
                        const isInline = !node?.properties?.className &&
                            !(node?.position && node?.tagName === 'code' &&
                                node?.parent?.tagName === 'pre');
                        // Simpler heuristic: if there's a language class, it's a code block
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
                {content}
            </ReactMarkdown>
        );
    } catch (e) {
        // Fallback to plain text if ReactMarkdown throws
        console.error('[SafeMarkdown] Render error, falling back to plain text:', e);
        return <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>;
    }
};

export const MessageList = ({ messages, isGenerating }: MessageListProps) => {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Ensure we scroll to the bottom during streaming
        if (isGenerating) {
            endRef.current?.scrollIntoView({ behavior: 'auto' });
        } else {
            endRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isGenerating]);

    return (
        <div className="messages" style={{
            flexGrow: 1,
            overflowY: 'auto',
            padding: '24px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '32px'
        }}>
            {messages.map((msg, i) => {
                const isLastAI = i === messages.length - 1 && msg.role === 'ai' && isGenerating;
                // Strip out all internal AI tags completely so they never pollute the chat
                let safeContent = (msg.content ?? '')
                    .replace(/<think>[\s\S]*?<\/think>/g, '')
                    .replace(/<think>[\s\S]*$/g, '')
                    .replace(/<tool_call\s+name="([^"]+)">[\s\S]*?<\/tool_call>/g, '')
                    .replace(/<tool_call\s+name="([^"]+)">[\s\S]*$/g, '')
                    .replace(/<observation>[\s\S]*?<\/observation>/g, '')
                    .replace(/<observation>[\s\S]*$/g, '')
                    .trim();

                // If the AI is still generating and hasn't output any real text yet, just show a single thinking indicator
                if (safeContent === '' && msg.role === 'ai') {
                    safeContent = '🤔 *Thinking...*';
                }

                return (
                    <div key={i} className="animate-slide-up" style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '0 4px',
                            marginBottom: '4px'
                        }}>
                            <div style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: msg.role === 'user' ? 'var(--bg-surface-lighter)' : 'hsla(190, 100%, 50%, 0.1)',
                                border: '1px solid var(--border-dim)'
                            }}>
                                <span className={`codicon ${msg.role === 'user' ? 'codicon-account' : 'codicon-hubot'}`}
                                    style={{ fontSize: '12px', color: msg.role === 'user' ? 'var(--text-muted)' : 'var(--accent-primary)' }}></span>
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {msg.role === 'user' ? 'You' : 'Orbit'}
                            </span>
                        </div>

                        <div className={`message-bubble ${msg.role}`} style={{
                            padding: msg.role === 'user' ? '10px 14px' : '0',
                            borderRadius: 'var(--radius-md)',
                            maxWidth: msg.role === 'user' ? '90%' : '100%',
                            fontSize: '13px',
                            lineHeight: '1.6',
                            backgroundColor: msg.role === 'user' ? 'var(--bg-surface)' : 'transparent',
                            color: 'var(--text-main)',
                            border: msg.role === 'user' ? '1px solid var(--border-base)' : 'none',
                        }}>
                            {msg.role === 'user' ? (
                                <div style={{ whiteSpace: 'pre-wrap' }}>{safeContent}</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {msg.structuredReasoning ? (
                                        <StructuredReasoning reasoning={msg.structuredReasoning} />
                                    ) : (
                                        <SafeMarkdown content={safeContent} />
                                    )}
                                    {isLastAI && <span className="blinking-cursor" />}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
            <div ref={endRef} />
        </div>
    );
};
