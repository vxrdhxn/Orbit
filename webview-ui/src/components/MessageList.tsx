import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEffect, useRef, useState } from 'react';
import { CodeBlock } from './CodeBlock';
import { StructuredReasoning } from './StructuredReasoning';
import { parseAgentContent, describeTool, toolArgs, ToolPart, ThinkPart } from '../utilities/agentParser';

interface Message {
    role: 'user' | 'ai' | 'system';
    content: string;
    structuredReasoning?: any;
    attachments?: string[];
    image?: string;
}

interface MessageListProps {
    messages: Message[];
    isGenerating?: boolean;
    statusMessage?: string;
    onSuggestion?: (text: string) => void;
}

/**
 * Markdown renderer. Catches render errors from half-streamed content and
 * falls back to plain text.
 */
export const SafeMarkdown = ({ content }: { content: string }) => {
    try {
        return (
            <div className="markdown">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        code({ className, children, ...props }: any) {
                            const match = /language-([\w:./\\-]+)/.exec(className || '');
                            const text = String(children);
                            // Fenced blocks have a language class or span several lines.
                            if (match || text.includes('\n')) {
                                return <CodeBlock language={match?.[1] ?? 'text'} value={text.replace(/\n$/, '')} />;
                            }
                            return <code className="inline-code" {...props}>{children}</code>;
                        },
                        pre({ children }: any) {
                            // CodeBlock renders its own container.
                            return <>{children}</>;
                        }
                    }}
                >
                    {content}
                </ReactMarkdown>
            </div>
        );
    } catch (e) {
        console.error('[SafeMarkdown] Render error, falling back to plain text:', e);
        return <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>;
    }
};

/** One tool call as a compact row; click to see its input and result. */
const ToolStep = ({ part, running }: { part: ToolPart; running: boolean }) => {
    const [open, setOpen] = useState(false);
    const { verb, target, icon } = describeTool(part);
    const args = toolArgs(part);
    const state = running ? 'running' : part.resultStatus === 'error' ? 'error' : part.result !== undefined ? 'ok' : 'idle';

    let summary = '';
    if (part.name === 'apply' && typeof args.code === 'string') {
        const lines = args.code.replace(/\n$/, '').split('\n').length;
        summary = running && !part.closed ? `writing… ${lines} lines` : `${lines} lines`;
    } else if (part.result !== undefined) {
        const lines = part.result.split('\n').length;
        summary = part.resultStatus === 'error' ? 'failed' : `${lines} line${lines === 1 ? '' : 's'}`;
    }

    return (
        <div className={`tool-step tool-${state}`}>
            <button className="tool-step-header" onClick={() => setOpen(!open)} title="Show details">
                <span className="tool-dot">
                    {state === 'running'
                        ? <span className="codicon codicon-loading codicon-modifier-spin" />
                        : <span className={`codicon ${icon}`} />}
                </span>
                <span className="tool-verb">{verb}</span>
                <span className="tool-target">{target}</span>
                {summary && <span className="tool-summary">{summary}</span>}
                <span className={`codicon ${open ? 'codicon-chevron-down' : 'codicon-chevron-right'} tool-chevron`} />
            </button>
            {open && (
                <div className="tool-details">
                    {part.name === 'apply' && typeof args.code === 'string' ? (
                        <pre className="tool-output">{args.code}</pre>
                    ) : (
                        part.body.trim() && <pre className="tool-output tool-input">{part.body.trim()}</pre>
                    )}
                    {part.result !== undefined && (
                        <pre className={`tool-output ${part.resultStatus === 'error' ? 'tool-output-error' : ''}`}>
                            {part.result || '(no output)'}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
};

const ThinkBlock = ({ part }: { part: ThinkPart }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="think-block">
            <button className="think-header" onClick={() => setOpen(!open)}>
                <span className={`codicon ${open ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
                {part.closed ? 'Thought process' : 'Thinking…'}
            </button>
            {open && <div className="think-body">{part.text}</div>}
        </div>
    );
};

/** Animated "Thinking… 12s" line shown while the agent works, like a CLI agent. */
// Start of the current agent turn, shared so the timer survives re-mounts.
let turnStartedAt = Date.now();

const WorkingIndicator = ({ status }: { status?: string }) => {
    const elapsed = () => Math.floor((Date.now() - turnStartedAt) / 1000);
    const [seconds, setSeconds] = useState(elapsed);
    useEffect(() => {
        const timer = setInterval(() => setSeconds(elapsed()), 1000);
        return () => clearInterval(timer);
    }, []);
    const label = (status && status.trim()) || 'Thinking...';
    return (
        <div className="working-indicator">
            <span className="working-spark">✻</span>
            <span className="working-label">{label.replace(/\.\.\.$/, '…')}</span>
            <span className="working-time">{seconds}s{/Waiting/.test(label) ? '' : ' · esc to stop'}</span>
        </div>
    );
};

const AssistantTurn = ({ msg, live, statusMessage }: { msg: Message; live: boolean; statusMessage?: string }) => {
    if (msg.structuredReasoning) {
        return <StructuredReasoning reasoning={msg.structuredReasoning} />;
    }

    const parts = parseAgentContent(msg.content ?? '', live);
    const lastPart = parts[parts.length - 1];
    // Show the working line unless text is actively streaming in as the last part.
    const showIndicator = live && (!lastPart || lastPart.type !== 'text' || /Calling|Working|Waiting/.test(statusMessage || ''));

    return (
        <div className="assistant-turn">
            {parts.map((part, i) => {
                if (part.type === 'text') {
                    return <SafeMarkdown key={i} content={part.text} />;
                }
                if (part.type === 'think') {
                    return <ThinkBlock key={i} part={part} />;
                }
                const running = live && part.result === undefined;
                return <ToolStep key={i} part={part} running={running} />;
            })}
            {showIndicator && <WorkingIndicator status={statusMessage} />}
        </div>
    );
};

export const MessageList = ({ messages, isGenerating, statusMessage }: MessageListProps) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const stickToBottom = useRef(true);
    const wasGenerating = useRef(false);

    if (isGenerating && !wasGenerating.current) {
        turnStartedAt = Date.now();
        // A new request always scrolls into view.
        stickToBottom.current = true;
    }
    wasGenerating.current = !!isGenerating;

    const handleScroll = () => {
        const el = scrollRef.current;
        if (!el) {
            return;
        }
        // Follow new output only while the user is at the bottom.
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };

    useEffect(() => {
        const el = scrollRef.current;
        if (el && stickToBottom.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, [messages, isGenerating, statusMessage]);

    return (
        <div className="messages" ref={scrollRef} onScroll={handleScroll}>
            {messages.map((msg, i) => {
                const live = !!isGenerating && i === messages.length - 1 && msg.role === 'ai';
                if (msg.role === 'user') {
                    return (
                        <div key={i} className="user-turn animate-fade-in">
                            <div className="user-bubble">
                                {(msg.attachments?.length || msg.image) && (
                                    <div className="attachment-row">
                                        {msg.image && <img className="bubble-image" src={msg.image} alt="Attached" />}
                                        {msg.attachments?.map(p => (
                                            <span key={p} className="attachment-chip" title={p}>
                                                <span className="codicon codicon-file" />
                                                {p.split(/[/\\]/).pop()}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {msg.content}
                            </div>
                        </div>
                    );
                }
                return (
                    <div key={i} className="ai-turn animate-fade-in">
                        <AssistantTurn msg={msg} live={live} statusMessage={statusMessage} />
                    </div>
                );
            })}
            {/* Waiting for the extension to open the assistant turn. */}
            {isGenerating && messages[messages.length - 1]?.role === 'user' && (
                <div className="ai-turn">
                    <div className="assistant-turn"><WorkingIndicator status={statusMessage} /></div>
                </div>
            )}
        </div>
    );
};
