import { useState, KeyboardEvent, ClipboardEvent } from 'react';
import { VSCodeButton, VSCodeTextArea } from '@vscode/webview-ui-toolkit/react';

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
    onPasteImage
}: InputAreaProps) => {
    const [value, setValue] = useState('');

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

    return (
        <div className="input-container" onPaste={handlePaste} style={{
            padding: '16px',
            backgroundColor: 'transparent',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        }}>
            <div className="input-box" style={{
                border: '1px solid var(--vscode-widget-border)',
                borderRadius: '16px',
                backgroundColor: 'var(--vscode-input-background)',
                padding: '12px',
                boxShadow: 'var(--shadow-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
            }}>
                {selectedImage && (
                    <div className="animate-fade-in" style={{
                        fontSize: '0.85em',
                        color: 'var(--vscode-textLink-foreground)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 8px',
                        backgroundColor: 'var(--vscode-editor-inactiveSelectionBackground)',
                        borderRadius: '4px',
                        alignSelf: 'flex-start',
                        marginBottom: '4px'
                    }}>
                        <span className="codicon codicon-file-media"></span>
                        <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selectedImage.split(/[/\\]/).pop()}
                        </span>
                    </div>
                )}

                <VSCodeTextArea
                    value={value}
                    onInput={(e: any) => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything (Ctrl+L), @ to mention, / for workflows"
                    disabled={disabled && !isGenerating}
                    rows={Math.min(10, Math.max(2, value.split('\n').length))}
                    resize="none"
                    style={{
                        width: '100%',
                        border: 'none',
                        background: 'transparent',
                        outline: 'none',
                        padding: '0'
                    }}
                />

                <div className="input-footer" style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '8px'
                }}>
                    <div className="left-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <VSCodeButton appearance="icon" onClick={onImageSelect} disabled={disabled || isGenerating} title="Attach Image" style={{ opacity: 0.7 }}>
                            <span className="codicon codicon-add" style={{ fontSize: '18px' }}></span>
                        </VSCodeButton>

                        <div className="model-selector-pill" style={{
                            display: 'flex',
                            alignItems: 'center',
                            backgroundColor: 'var(--vscode-badge-background)',
                            color: 'var(--vscode-badge-foreground)',
                            borderRadius: '12px',
                            padding: '2px 8px',
                            fontSize: '0.8em',
                            cursor: 'pointer'
                        }}>
                            <span className="codicon codicon-sparkle" style={{ fontSize: '12px', marginRight: '4px' }}></span>
                            <select
                                value={currentModel}
                                onChange={(e) => onModelChange(e.target.value)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'inherit',
                                    fontFamily: 'inherit',
                                    fontSize: 'inherit',
                                    cursor: 'pointer',
                                    outline: 'none',
                                    appearance: 'none',
                                    maxWidth: '120px',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}
                                title="Change Model"
                            >
                                {models.map(m => <option key={m} value={m} style={{ background: 'var(--vscode-dropdown-background)', color: 'var(--vscode-dropdown-foreground)' }}>{m}</option>)}
                            </select>
                            <span className="codicon codicon-chevron-down" style={{ fontSize: '10px', marginLeft: '4px' }}></span>
                        </div>
                    </div>

                    <div className="right-controls">
                        {isGenerating ? (
                            <VSCodeButton appearance="icon" onClick={onStop} title="Stop Generation" style={{
                                borderRadius: '50%', width: '28px', height: '28px', backgroundColor: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)'
                            }}>
                                <span className="codicon codicon-debug-stop"></span>
                            </VSCodeButton>
                        ) : (
                            <VSCodeButton
                                appearance="primary"
                                onClick={handleSend}
                                disabled={disabled || !value.trim()}
                                title="Send"
                                style={{
                                    borderRadius: '50%',
                                    width: '32px',
                                    height: '32px',
                                    minWidth: '32px',
                                    padding: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <span className="codicon codicon-arrow-up"></span>
                            </VSCodeButton>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
