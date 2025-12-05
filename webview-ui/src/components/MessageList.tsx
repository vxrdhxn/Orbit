import ReactMarkdown from 'react-markdown';
import { CodeBlock } from './CodeBlock';
import { useEffect, useRef } from 'react';

interface Message {
    role: 'user' | 'ai' | 'system';
    content: string;
}

interface MessageListProps {
    messages: Message[];
}

export const MessageList = ({ messages }: MessageListProps) => {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="messages" style={{
            flexGrow: 1,
            overflowY: 'auto',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
        }}>
            {messages.map((msg, i) => (
                <div key={i} className={`message ${msg.role}`} style={{
                    padding: '10px 14px',
                    borderRadius: '14px',
                    maxWidth: '85%',
                    fontSize: 'var(--vscode-font-size)',
                    lineHeight: '1.5',
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    backgroundColor: msg.role === 'user' ? 'var(--vscode-button-background)' : 'var(--vscode-editor-inactiveSelectionBackground)',
                    color: msg.role === 'user' ? 'var(--vscode-button-foreground)' : 'var(--vscode-editor-foreground)',
                    border: msg.role === 'ai' ? '1px solid var(--vscode-widget-border)' : 'none',
                    marginBottom: '4px'
                }}>
                    {msg.role === 'user' ? (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                    ) : (
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
                                        <code className={className} {...props}>
                                            {children}
                                        </code>
                                    );
                                }
                            }}
                        >
                            {msg.content}
                        </ReactMarkdown>
                    )}
                </div>
            ))}
            <div ref={endRef} />
        </div>
    );
};
