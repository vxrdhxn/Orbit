import { useState, useEffect, useRef } from 'react';
import { vscode } from './utilities/vscode';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';

interface Message {
    role: 'user' | 'ai' | 'system';
    content: string;
}

function App() {
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--vscode-editor-background)', color: 'var(--vscode-editor-foreground)' }}>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {messages.length === 0 ? (
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        opacity: 0.8,
                        gap: '10px'
                    }}>
                        <div style={{ fontSize: '2em', fontWeight: 600 }}>Orbit</div>
                        <div style={{ fontSize: '0.9em' }}>Always watching your code</div>
                    </div>
                ) : (
                    <MessageList messages={messages} />
                )}

                {statusMessage && isGenerating && (
                    <div className="glass animate-pulse" style={{
                        position: 'absolute',
                        bottom: '20px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '8px 16px',
                        borderRadius: '20px',
                        fontSize: '0.85em',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        border: '1px solid var(--vscode-widget-border)',
                        boxShadow: 'var(--shadow-md)',
                        color: 'var(--vscode-descriptionForeground)',
                        zIndex: 20
                    }}>
                        <span className="codicon codicon-loading codicon-modifier-spin"></span>
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
