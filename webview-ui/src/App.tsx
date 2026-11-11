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
        messages, setMessages, addMessage, appendAIResponseChunk, startAIResponse, setAIResponse, clearChat,
        chatHistory, setChatHistory,
        isGenerating, setIsGenerating,
        models, setModels,
        currentModel, setCurrentModel,
        selectedImage, setSelectedImage,
        attachments, addAttachment, removeAttachment, clearAttachments,
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
                case 'agentStart':
                    startAIResponse();
                    break;
                case 'agentDelta':
                    if (message.value) appendAIResponseChunk(message.value);
                    break;
                case 'agentSet':
                    setAIResponse(message.value ?? '');
                    break;
                case 'agentEnd':
                    setIsGenerating(false);
                    setStatusMessage('');
                    break;
                case 'status':
                    setStatusMessage(message.value);
                    if (message.value === 'Generation cancelled.') {
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
                case 'fileAttached':
                    if (message.value?.path) addAttachment(message.value);
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
    }, [hasAttemptedInitialHistoryLoad, setChatHistory, setHasAttemptedInitialHistoryLoad, setView, addMessage, setIsGenerating, setStatusMessage, appendAIResponseChunk, startAIResponse, setAIResponse, setConnectionState, setModels, setCurrentModel, setSelectedImage, addAttachment, clearChat, setMessages, setProposal, setDecisions, appendDecisions]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && useOrbitStore.getState().isGenerating) {
                vscode.postMessage({ type: 'cancelGeneration' });
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const handleSend = (text: string) => {
        if (isGenerating) return;

        const paths = attachments.map(a => a.path);
        addMessage({
            role: 'user',
            content: text,
            ...(paths.length ? { attachments: paths } : {}),
            ...(selectedImage ? { image: selectedImage } : {})
        });
        setIsGenerating(true);
        vscode.postMessage(paths.length
            ? { type: 'sendMessage', value: text, attachments: paths }
            : { type: 'sendMessage', value: text });
        setSelectedImage(null);
        clearAttachments();
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

    const suggestions = [
        { icon: 'codicon-book', text: 'Explain the open file' },
        { icon: 'codicon-bug', text: 'Find bugs in the open file' },
        { icon: 'codicon-beaker', text: 'Write unit tests for the open file' },
        { icon: 'codicon-list-tree', text: 'Give me an overview of this project' },
    ];

    return (
        <ErrorBoundary resetKey={messages.length}>
        <div className="app-shell">
            <header className="app-header">
                <div className="app-title">
                    <span className="codicon codicon-sparkle" />
                    <span>Orbit</span>
                </div>
                <div className="app-header-right">
                    <span
                        className={`status-dot ${isGenerating ? 'busy' : connectionState === 'Connected' ? 'ok' : connectionState === 'Checking...' ? 'checking' : 'down'}`}
                        title={isGenerating ? 'Working' : connectionState}
                    />
                    {telemetry && !isGenerating && (
                        <span className="telemetry" title={`Last step took ${(telemetry.durationMs / 1000).toFixed(1)}s`}>
                            {telemetry.tps} tok/s
                        </span>
                    )}
                    <button className="icon-button" title="Chat History" onClick={() => setView('chatHistory')}>
                        <span className="codicon codicon-history" />
                    </button>
                    <button className="icon-button" title="New Chat" onClick={handleNewChat}>
                        <span className="codicon codicon-add" />
                    </button>
                </div>
            </header>

            <div className="app-body">
                {messages.length === 0 ? (
                    <div className="welcome">
                        <div className="welcome-logo"><span className="codicon codicon-sparkle" /></div>
                        <div className="welcome-title">Orbit</div>
                        <div className="welcome-subtitle">Code at the speed of thought</div>
                        <div className="welcome-hint">I can read your files, edit code, and run commands. Ask me anything.</div>
                        <div className="suggestions">
                            {suggestions.map(s => (
                                <button key={s.text} className="suggestion" onClick={() => handleSend(s.text)}>
                                    <span className={`codicon ${s.icon}`} />
                                    {s.text}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <ErrorBoundary resetKey={messages.length}>
                        <MessageList messages={messages} isGenerating={isGenerating} statusMessage={statusMessage} />
                    </ErrorBoundary>
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
                attachments={attachments}
                onRemoveAttachment={removeAttachment}
            />
        </div>
        </ErrorBoundary>
    );
}

export default App;
