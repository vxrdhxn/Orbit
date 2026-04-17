import { useState, useEffect, useRef } from 'react';
import { vscode } from './utilities/vscode';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { DiffApproval } from './components/DiffApproval';
import { DecisionHistory } from './components/DecisionHistory';
import { DiffProposal } from './types';

declare global {
    interface Window {
        initialData?: any;
    }
}

interface Message {
    role: 'user' | 'ai' | 'system';
    content: string;
}

function App() {
    const [view, setView] = useState<'chat' | 'diff' | 'history'>(window.initialData ? 'diff' : 'chat');
    const [proposal, setProposal] = useState<DiffProposal | null>(window.initialData || null);
    const [decisions, setDecisions] = useState<any[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [models, setModels] = useState<string[]>([]);
    const [currentModel, setCurrentModel] = useState<string>('');
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>('');

    // To handle streaming updates correctly without dependency issues
    const messagesRef = useRef<Message[]>([]);
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            switch (message.type) {
                case 'addMessage':
                    setMessages(prev => [...prev, { role: message.role, content: message.content }]);
                    setIsGenerating(message.role === 'user'); // If adding a user message, we are likely starting generation
                    break;
                case 'addResponse':
                    setMessages(prev => [...prev, { role: 'ai', content: message.value }]);
                    setIsGenerating(false);
                    setStatusMessage('');
                    break;
                case 'addResponseChunk':
                    setMessages(prev => {
                        const last = prev[prev.length - 1];
                        if (last && last.role === 'ai') {
                            return [...prev.slice(0, -1), { ...last, content: last.content + message.value }];
                        } else {
                            return [...prev, { role: 'ai', content: message.value }];
                        }
                    });
                    break;
                case 'status':
                    setStatusMessage(message.value);
                    if (message.value === 'Generation cancelled.' || message.value === '') {
                        setIsGenerating(false);
                    }
                    break;
                case 'updateModels':
                    setModels(message.value.models);
                    setCurrentModel(message.value.current || message.value.models[0] || '');
                    break;
                case 'modelListError':
                    setModels([`Error: ${message.value}`]);
                    break;
                case 'imageSelected':
                    setSelectedImage(message.value);
                    break;
                case 'clearChat':
                    setMessages([]);
                    setIsGenerating(false);
                    setSelectedImage(null);
                    setStatusMessage('');
                    break;
                case 'loadChat':
                    setMessages(message.value);
                    setIsGenerating(false);
                    break;
                case 'insertFileReference':
                    window.dispatchEvent(new CustomEvent('orbit-insert-text', { detail: message.value }));
                    break;
                case 'showDiff':
                    setProposal(message.value);
                    setView('diff');
                    break;
                case 'showHistory':
                    setDecisions(message.value || []);
                    setView('history');
                    break;
                case 'updateDecisions':
                    setDecisions(message.value);
                    break;
                case 'appendDecisions':
                    if (message.value && message.value.length > 0) {
                        setDecisions(prev => [...prev, ...message.value]);
                    }
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        // Tell extension we are ready
        vscode.postMessage({ type: 'webviewReady' });

        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleSend = (text: string) => {
        if (isGenerating) return;

        setMessages(prev => [...prev, { role: 'user', content: text }]);
        setIsGenerating(true);
        vscode.postMessage({ type: 'sendMessage', value: text });
        // Clear image selection as it is sent (handled by backend clearing, but UI should reflect?)
        // Backend clears it after use. UI waits for 'imageSelected' or just assumes cleared?
        // Actually backend clears ITs state. We should clear ours.
        setSelectedImage(null);
    };

    const handleModelChange = (model: string) => {
        if (model.includes('(Download)')) {
            vscode.postMessage({ type: 'pullModel', value: model.split(' ')[0] });
        } else {
            setCurrentModel(model);
            vscode.postMessage({ type: 'changeModel', value: model });
        }
    };

    const handleImageSelect = () => {
        vscode.postMessage({ type: 'selectImage' });
    };

    const handleStop = () => {
        vscode.postMessage({ type: 'cancelGeneration' });
    };

    const handlePasteImage = (base64: string) => {
        vscode.postMessage({ type: 'pasteImage', value: base64 });
    };

    const handleRemoveImage = () => {
        setIsGenerating(false); // Should not affect generating, but good safety
        setSelectedImage(null);
        vscode.postMessage({ type: 'clearImage' });
    };

    const handleFilePicker = () => {
        vscode.postMessage({ type: 'openFilePicker' });
    };

    if (view === 'diff' && proposal) {
        return <DiffApproval proposal={proposal} />;
    }

    if (view === 'history') {
        return <DecisionHistory decisions={decisions} />;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
            {/* Pro Header */}
            <header className="glass" style={{
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                zIndex: 100,
                borderBottom: '1px solid var(--border-dim)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '-0.5px' }}>Orbit</div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span className={`codicon codicon-record ${isGenerating ? 'animate-pulse' : ''}`} 
                              style={{ color: isGenerating ? 'var(--accent-primary)' : 'var(--text-dim)', fontSize: '10px' }}></span>
                        {isGenerating ? 'Reasoning...' : 'Connected'}
                    </div>
                    <div style={{ width: '1px', height: '14px', background: 'var(--border-dim)' }}></div>
                    <button className="clickable" title="Clear Chat" onClick={() => vscode.postMessage({ type: 'clearChat' })}>
                        <span className="codicon codicon-trash" style={{ fontSize: '14px', color: 'var(--text-dim)' }}></span>
                    </button>
                </div>
            </header>

            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {messages.length === 0 ? (
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        opacity: 0.9
                    }}>
                        <div style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '50%',
                            background: 'radial-gradient(circle, var(--accent-primary) 0%, transparent 70%)',
                            position: 'absolute',
                            filter: 'blur(30px)',
                            opacity: 0.2
                        }}></div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 600, letterSpacing: '-1.5px', color: 'var(--text-main)', marginBottom: '4px', position: 'relative' }}>
                            Orbit
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                            Code at the speed of thought
                        </div>
                    </div>
                ) : (
                    <MessageList messages={messages} isGenerating={isGenerating} />
                )}

                {statusMessage && isGenerating && (
                    <div className="glass animate-slide-up" style={{
                        position: 'absolute',
                        bottom: '24px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '6px 14px',
                        borderRadius: '100px',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: 'var(--shadow-premium)',
                        color: 'var(--text-main)',
                        zIndex: 20,
                        border: '1px solid hsla(190, 100%, 50%, 0.2)'
                    }}>
                        <span className="codicon codicon-loading codicon-modifier-spin" style={{ color: 'var(--accent-primary)' }}></span>
                        {statusMessage}
                    </div>
                )}
            </div>

            <InputArea
                onSend={handleSend}
                onImageSelect={handleImageSelect}
                onStop={handleStop}
                disabled={false}
                isGenerating={isGenerating}
                selectedImage={selectedImage}
                models={models}
                currentModel={currentModel}
                onModelChange={handleModelChange}
                onPasteImage={handlePasteImage}
                onRemoveImage={handleRemoveImage}
                onFilePicker={handleFilePicker}
            />
        </div>
    );
}

export default App;
