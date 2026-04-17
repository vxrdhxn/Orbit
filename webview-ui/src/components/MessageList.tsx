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
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
        }}>
            {messages.map((msg, i) => {
                const isLastAI = i === messages.length - 1 && msg.role === 'ai' && isGenerating;
                
                return (
                    <div key={i} className={`message-container animate-fade-in`} style={{
                        display: 'flex',
                        flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                        gap: '12px',
                        alignItems: 'flex-start'
                    }}>
                        <div className="avatar" style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: msg.role === 'user' ? 'var(--vscode-button-background)' : 'var(--vscode-editor-inactiveSelectionBackground)',
                            color: msg.role === 'user' ? 'var(--vscode-button-foreground)' : 'var(--vscode-editor-foreground)',
                            flexShrink: 0,
                            marginTop: '2px'
                        }}>
                            <span className={`codicon ${msg.role === 'user' ? 'codicon-account' : 'codicon-hubot'}`}></span>
                        </div>

                        <div className={`message-bubble ${msg.role}`} style={{
                            padding: '12px 16px',
                            borderRadius: '12px',
                            maxWidth: '85%',
                            fontSize: 'var(--vscode-font-size)',
                            lineHeight: '1.5',
                            backgroundColor: msg.role === 'user' ? 'var(--vscode-button-secondaryBackground)' : 'var(--vscode-editor-inactiveSelectionBackground)',
                            color: msg.role === 'user' ? 'var(--vscode-button-secondaryForeground)' : 'var(--vscode-editor-foreground)',
                            border: '1px solid var(--vscode-widget-border)',
                            boxShadow: 'var(--shadow-sm)'
                        }}>
                            {msg.role === 'user' ? (
                                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                            ) : (
                                <>
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
                                                        backgroundColor: 'rgba(128,128,128,0.2)',
                                                        padding: '2px 4px',
                                                        borderRadius: '4px',
                                                        fontFamily: 'var(--vscode-editor-font-family)'
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
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
            <div ref={endRef} />
        </div>
    );
};
