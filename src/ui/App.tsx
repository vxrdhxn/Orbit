import React, { useState, useEffect, useRef } from 'react';
import { provideVSCodeDesignSystem, vsCodeButton, vsCodeTextArea } from '@vscode/webview-ui-toolkit';

// Register UI Toolkit components
provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeTextArea());

// Mock acquireVsCodeApi for development outside VS Code
const acquireVsCodeApi = () => {
    if ((window as any).acquireVsCodeApi) {
        return (window as any).acquireVsCodeApi();
    }
    return {
        postMessage: (msg: any) => console.log('Mock postMessage:', msg),
        setState: () => { },
        getState: () => ({})
    };
};

const vscode = acquireVsCodeApi();

declare global {
    namespace JSX {
        interface IntrinsicElements {
            'vscode-button': any;
            'vscode-text-area': any;
        }
    }
}

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

function App() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<{ online: boolean; local: boolean; active: string }>({ online: false, local: false, active: 'none' });
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'chat-response') {
                setMessages(prev => [...prev, message.message]);
                setIsLoading(false);
            } else if (message.type === 'health-update') {
                setStatus(message.status);
            }
        };

        window.addEventListener('message', handleMessage);

        // Request initial status
        vscode.postMessage({ type: 'health-request' });

        return () => window.removeEventListener('message', handleMessage);
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const handleSend = () => {
        if (!input.trim() || isLoading) return;

        const userMsg: ChatMessage = { role: 'user', content: input };
        const newHistory = [...messages, userMsg];

        setMessages(newHistory);
        setIsLoading(true);
        setInput('');

        vscode.postMessage({
            type: 'chat-request',
            messages: newHistory
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const getStatusColor = () => {
        if (status.active === 'Online Cloud') return 'bg-green-500';
        if (status.active === 'Local Ollama') return 'bg-blue-500';
        return 'bg-red-500';
    };

    const getStatusText = () => {
        if (status.active === 'none') {
            if (!status.online && !status.local) return 'No Providers';
            return 'Connecting...';
        }
        return status.active;
    };

    return (
        <div className="p-4 flex flex-col h-screen text-white bg-[var(--vscode-editor-background)] font-sans box-border overflow-hidden">
            <header className="mb-4 shrink-0">
                <h1 className="text-xl font-bold text-[var(--vscode-foreground)]">Orbit AI</h1>
                <div className="text-xs text-[var(--vscode-descriptionForeground)] flex items-center">
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${getStatusColor()}`}></span>
                    {getStatusText()}
                </div>
            </header>

            <div className="flex-1 overflow-y-auto mb-4 border border-[var(--vscode-input-border)] rounded p-2 bg-[var(--vscode-editor-background)]">
                {messages.length === 0 ? (
                    <div className="text-[var(--vscode-foreground)] opacity-70 italic text-center mt-10">
                        Start a conversation...
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`p-2 rounded max-w-[85%] ${msg.role === 'user'
                                ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] self-end'
                                : 'bg-[var(--vscode-editor-inactiveSelectionBackground)] self-start'
                                }`}>
                                <div className="font-xs opacity-50 mb-1 capitalize">{msg.role}</div>
                                <div className="whitespace-pre-wrap">{msg.content}</div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="p-2 rounded self-start bg-[var(--vscode-editor-inactiveSelectionBackground)] opacity-70">
                                ⏳ Thinking...
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-2 shrink-0">
                <vscode-text-area
                    placeholder="Ask Orbit..."
                    rows={3}
                    className="w-full"
                    value={input}
                    onInput={(e: any) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                ></vscode-text-area>
                <vscode-button onClick={handleSend} disabled={isLoading}>
                    Send
                </vscode-button>
            </div>
        </div>
    );
}

export default App;
