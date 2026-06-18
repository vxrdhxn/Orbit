import { useEffect } from 'react';
import { vscode } from './utilities/vscode';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { DiffApproval } from './components/DiffApproval';
import { DecisionHistory } from './components/DecisionHistory';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ChatHistory } from './components/ChatHistory';
import { useOrbitStore } from './store/useOrbitStore';

declare global {
    interface Window {
        initialData?: any;
    }
}

function App() {
    const {
        view, setView,
        proposal, setProposal,
        decisions, setDecisions, appendDecisions,
        messages, setMessages, addMessage, appendAIResponseChunk, clearChat,
        chatHistory, setChatHistory,
        isGenerating, setIsGenerating,
        models, setModels,
        currentModel, setCurrentModel,
        selectedImage, setSelectedImage,
        statusMessage, setStatusMessage,
        connectionState, setConnectionState,
        hasAttemptedInitialHistoryLoad, setHasAttemptedInitialHistoryLoad,
        telemetry, setTelemetry
    } = useOrbitStore();

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            switch (message.type) {
                case 'updateHistory':
                    setChatHistory(message.value);
                    if (!hasAttemptedInitialHistoryLoad) {
                        const state = useOrbitStore.getState();
                        if (message.value && message.value.length > 0 && state.messages.length === 0 && state.view === 'chat') {
                            setView('chatHistory');
                        }
                        setHasAttemptedInitialHistoryLoad(true);
                    }
                    break;
                case 'addMessage':
                    addMessage({ role: message.role, content: message.content });
                    setIsGenerating(message.role === 'user');
                    break;
                case 'addResponse':
                    addMessage({ role: 'ai', content: message.value });
                    setIsGenerating(false);
                    setStatusMessage('');
                    break;
                case 'addResponseChunk':
                    if (message.value == null) break;
                    appendAIResponseChunk(message.value);
                    break;
                case 'status':
                    setStatusMessage(message.value);
                    if (message.value === 'Generation cancelled.' || message.value === '') {
                        setIsGenerating(false);
                    }
                    break;
                case 'updateConnectionState':
                    setConnectionState(message.value.ok ? 'Connected' : 'Disconnected');
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
                    clearChat();
                    break;
                case 'loadChat':
                    setMessages(message.value);
                    setIsGenerating(false);
                    setView('chat');
                    break;
                case 'insertFileReference':
                    window.dispatchEvent(new CustomEvent('orbit-insert-text', { detail: message.value }));
                    break;
                case 'showDiff':
                    setProposal(message.value);
                    setView('diff');
                    break;
                case 'telemetry':
                    setTelemetry(message.value);
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
                        appendDecisions(message.value);
                    }
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        vscode.postMessage({ type: 'webviewReady' });

        return () => window.removeEventListener('message', handleMessage);
    }, [hasAttemptedInitialHistoryLoad, setChatHistory, setHasAttemptedInitialHistoryLoad, setView, addMessage, setIsGenerating, setStatusMessage, appendAIResponseChunk, setConnectionState, setModels, setCurrentModel, setSelectedImage, clearChat, setMessages, setProposal, setDecisions, appendDecisions]);

    const handleSend = (text: string) => {
        if (isGenerating) return;

        addMessage({ role: 'user', content: text });
        setIsGenerating(true);
        vscode.postMessage({ type: 'sendMessage', value: text });
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
        setIsGenerating(false);
        setSelectedImage(null);
        vscode.postMessage({ type: 'clearImage' });
    };

    const handleFilePicker = () => {
        vscode.postMessage({ type: 'openFilePicker' });
    };

    const handleLoadSession = (id: string) => {
        vscode.postMessage({ type: 'loadSession', value: id });
    };

    const handleDeleteSession = (id: string) => {
        vscode.postMessage({ type: 'deleteSession', value: id });
    };

    const handleNewChat = () => {
        setMessages([]);
        vscode.postMessage({ type: 'newChat' });
        setView('chat');
    };

    if (view === 'diff' && proposal) {
        return <DiffApproval proposal={proposal} />;
    }

    if (view === 'history') {
        return <DecisionHistory decisions={decisions} />;
    }

    if (view === 'chatHistory') {
        return <ChatHistory 
            sessions={chatHistory} 
            onSelect={handleLoadSession} 
            onNewChat={handleNewChat} 
            onDelete={handleDeleteSession}
        />;
    }

    return (
        <ErrorBoundary resetKey={messages.length}>
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
                        <span className={`codicon ${connectionState === 'Checking...' ? 'codicon-loading codicon-modifier-spin' : 'codicon-record'} ${isGenerating ? 'animate-pulse' : ''}`} 
                              style={{ color: isGenerating ? 'var(--accent-primary)' : (connectionState === 'Connected' ? 'var(--text-dim)' : '#f48771'), fontSize: '10px' }}></span>
                        {isGenerating ? 'Reasoning...' : connectionState}
                    </div>
                    {telemetry && (
                        <>
                            <div style={{ width: '1px', height: '14px', background: 'var(--border-dim)' }}></div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }} title={`Last generation took ${(telemetry.durationMs/1000).toFixed(1)}s`}>
                                <span className="codicon codicon-dashboard" style={{ fontSize: '12px' }}></span>
                                {telemetry.tps} tps
                            </div>
                        </>
                    )}
                    <div style={{ width: '1px', height: '14px', background: 'var(--border-dim)' }}></div>
                    <button className="clickable" title="Chat History" onClick={() => setView('chatHistory')} style={{ background: 'transparent' }}>
                        <span className="codicon codicon-history" style={{ fontSize: '14px', color: 'var(--text-dim)' }}></span>
                    </button>
                    <button className="clickable" title="New Chat" onClick={handleNewChat} style={{ background: 'transparent' }}>
                        <span className="codicon codicon-add" style={{ fontSize: '14px', color: 'var(--text-dim)' }}></span>
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
                    <ErrorBoundary resetKey={messages.length}>
                        <MessageList messages={messages} isGenerating={isGenerating} />
                    </ErrorBoundary>
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
        </ErrorBoundary>
    );
}

export default App;
