import { useState, useEffect, KeyboardEvent, ClipboardEvent } from 'react';
import { FileReferenceIndicator } from './FileReferenceIndicator';
import { ModelSelector } from './ModelSelector';
import { Attachment } from '../types';

interface InputAreaProps {
    onSend: (text: string) => void;
    onImageSelect: () => void;
    onStop: () => void;
    disabled: boolean;
    isGenerating: boolean;
    selectedImage: string | null;
    models: string[];
    currentModel: string;
    onModelChange: (model: string) => void;
    onPasteImage: (base64: string) => void;
    onRemoveImage: () => void;
    onFilePicker: () => void;
    attachments?: Attachment[];
    onRemoveAttachment?: (path: string) => void;
}

export const InputArea = ({
    onSend,
    onImageSelect,
    onStop,
    disabled,
    isGenerating,
    selectedImage,
    models,
    currentModel,
    onModelChange,
    onPasteImage,
    onRemoveImage,
    onFilePicker,
    attachments = [],
    onRemoveAttachment
}: InputAreaProps) => {
    const [value, setValue] = useState('');

    useEffect(() => {
        const handleInsertByEvent = (e: CustomEvent) => {
            setValue(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + e.detail);
        };
        window.addEventListener('orbit-insert-text', handleInsertByEvent as EventListener);
        return () => window.removeEventListener('orbit-insert-text', handleInsertByEvent as EventListener);
    }, []);

    const handleSend = () => {
        if (value.trim()) {
            onSend(value);
            setValue('');
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handlePaste = (e: ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const blob = items[i].getAsFile();
                if (blob) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const base64 = event.target?.result as string;
                        if (base64) {
                            onPasteImage(base64);
                        }
                    };
                    reader.readAsDataURL(blob);
                }
                return;
            }
        }
    };

    const isPreview = selectedImage && selectedImage.startsWith('data:');

    return (
        <div className="composer" onPaste={handlePaste}>
            <div className="composer-box">
                {attachments.length > 0 && (
                    <div className="attachment-row">
                        {attachments.map(a => (
                            <span key={a.path} className="attachment-chip" title={a.path}>
                                <span className="codicon codicon-file" />
                                {a.name}
                                <button className="chip-remove" onClick={() => onRemoveAttachment?.(a.path)} title="Remove attachment">
                                    <span className="codicon codicon-close" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                {selectedImage && (
                    <div className="image-preview">
                        {isPreview ? (
                            <img src={selectedImage} alt="Selected" />
                        ) : (
                            <span className="badge">
                                <span className="codicon codicon-file-media" />
                                {selectedImage.split(/[/\\]/).pop()}
                            </span>
                        )}
                        <button className="image-remove" onClick={onRemoveImage} title="Remove Image">
                            <span className="codicon codicon-close" />
                        </button>
                    </div>
                )}

                <textarea
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isGenerating ? 'Orbit is working… (Esc to stop)' : 'Ask Orbit to explain, fix or build something…'}
                    aria-label="Ask Orbit"
                    disabled={disabled && !isGenerating}
                    rows={Math.min(12, Math.max(2, value.split('\n').length))}
                    className="composer-input"
                />

                <FileReferenceIndicator text={value} />

                <div className="composer-footer">
                    <div className="composer-left">
                        <button className="icon-button" onClick={onFilePicker} disabled={disabled} title="Attach a file">
                            <span className="codicon codicon-attach" />
                        </button>
                        <button className="icon-button" onClick={onImageSelect} disabled={disabled} title="Attach an image (or paste one)">
                            <span className="codicon codicon-file-media" />
                        </button>
                        <ModelSelector models={models} current={currentModel} onSelect={onModelChange} />
                    </div>

                    {isGenerating ? (
                        <button className="send-button stop" onClick={onStop} title="Stop (Esc)">
                            <span className="codicon codicon-debug-stop" />
                        </button>
                    ) : (
                        <button
                            className={`send-button ${value.trim() ? 'ready' : ''}`}
                            onClick={handleSend}
                            disabled={disabled || !value.trim()}
                            title="Send message (Enter)"
                        >
                            <span className="codicon codicon-arrow-up" />
                        </button>
                    )}
                </div>
            </div>
            <div className="composer-hint">Enter to send · Shift+Enter for a new line · Esc to stop</div>
        </div>
    );
};
