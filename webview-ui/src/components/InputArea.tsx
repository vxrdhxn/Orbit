import { useState, useEffect, KeyboardEvent, ClipboardEvent } from 'react';
import { VSCodeButton, VSCodeTextArea } from '@vscode/webview-ui-toolkit/react';
import { FileReferenceIndicator } from './FileReferenceIndicator';
import { ModelSelector } from './ModelSelector';

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
    onFilePicker
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
        <div className="glass-dark" onPaste={handlePaste} style={{
            padding: '20px',
            background: 'transparent',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            borderTop: 'none',
            zIndex: 30
        }}>
            <div className="glow-on-focus" style={{
                transition: 'var(--transition-smooth)',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-base)',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            }}>
                {selectedImage && (
                    <div className="image-preview" style={{
                        position: 'relative',
                        alignSelf: 'flex-start',
                        marginBottom: '4px',
                        display: 'inline-block'
                    }}>
                        {isPreview ? (
                            <img src={selectedImage} alt="Selected" style={{
                                maxHeight: '90px',
                                maxWidth: '180px',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-base)'
                            }} />
                        ) : (
                            <div className="badge" style={{ backgroundColor: 'var(--bg-surface-lighter)', color: 'var(--accent-primary)', fontSize: '11px' }}>
                                <span className="codicon codicon-file-media" style={{ fontSize: '12px' }}></span>
                                <span style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {selectedImage.split(/[/\\]/).pop()}
                                </span>
                            </div>
                        )}

                        <div
                            onClick={onRemoveImage}
                            title="Remove Image"
                            style={{
                                position: 'absolute',
                                top: '-8px',
                                right: '-8px',
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                backgroundColor: 'hsl(0, 70%, 50%)',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontSize: '10px',
                                border: '2px solid var(--bg-surface)'
                            }}
                        >
                            <span className="codicon codicon-close"></span>
                        </div>
                    </div>
                )}

                <textarea
                    value={value}
                    onInput={(e: any) => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Orbit everything (Ctrl+L)..."
                    disabled={disabled && !isGenerating}
                    rows={Math.min(10, Math.max(2, value.split('\n').length))}
                    style={{
                        width: '100%',
                        border: 'none',
                        background: 'transparent',
                        outline: 'none',
                        padding: '4px 0',
                        color: 'var(--text-main)',
                        resize: 'none',
                        fontSize: '13px',
                        fontFamily: 'inherit',
                        lineHeight: '1.6'
                    }}
                />

                <FileReferenceIndicator text={value} />

                <div className="input-footer" style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '4px'
                }}>
                    <div className="left-controls" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button className="clickable" onClick={onImageSelect} disabled={disabled || isGenerating} title="Attach Image" 
                                    style={{ padding: '6px', borderRadius: '6px', color: 'var(--text-dim)', background: 'transparent' }}>
                                <span className="codicon codicon-file-media" style={{ fontSize: '16px' }}></span>
                            </button>
                            <button className="clickable" onClick={onFilePicker} disabled={disabled || isGenerating} title="Attach File"
                                    style={{ padding: '6px', borderRadius: '6px', color: 'var(--text-dim)', background: 'transparent' }}>
                                <span className="codicon codicon-attach" style={{ fontSize: '16px' }}></span>
                            </button>
                        </div>

                        <ModelSelector models={models} current={currentModel} onSelect={onModelChange} />
                    </div>

                    <div className="right-controls">
                        {isGenerating ? (
                            <button className="clickable" onClick={handleStop} title="Stop Generation" style={{
                                width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-surface-lighter)', color: 'var(--text-main)', border: '1px solid var(--border-base)'
                            }}>
                                <span className="codicon codicon-debug-stop" style={{ fontSize: '14px' }}></span>
                            </button>
                        ) : (
                            <button
                                className="clickable"
                                onClick={handleSend}
                                disabled={disabled || !value.trim()}
                                title="Send"
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    background: value.trim() ? 'var(--accent-primary)' : 'var(--bg-surface-lighter)',
                                    color: value.trim() ? 'black' : 'var(--text-dim)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: value.trim() ? 'var(--shadow-glow)' : 'none'
                                }}
                            >
                                <span className="codicon codicon-arrow-up" style={{ fontSize: '18px', fontWeight: 'bold' }}></span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
            
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', textAlign: 'center', marginTop: '4px' }}>
                Orbit can make mistakes. Check important info.
            </div>
        </div>
    );
};
