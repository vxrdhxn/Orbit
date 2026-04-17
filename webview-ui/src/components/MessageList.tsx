import ReactMarkdown from 'react-markdown';
import { CodeBlock } from './CodeBlock';
import { useEffect, useRef } from 'react';

interface Message {
    role: 'user' | 'ai' | 'system';
    content: string;
}

interface MessageListProps {
    messages: Message[];
    isGenerating?: boolean;
}

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
                                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <ReactMarkdown
                                        components={{
                                            code({ node, inline, className, children, ...props }: any) {
                                                const match = /language-(\w+)/.exec(className || '');
                                                return !inline && match ? (
                                                    <CodeBlock
                                                        language={match[1]}
                                                        value={String(children).replace(/\n$/, '')}
                                                    />
                                                ) : (
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
                                        {msg.content}
                                    </ReactMarkdown>
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
