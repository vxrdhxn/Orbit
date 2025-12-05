import { useState, KeyboardEvent } from 'react';
import { VSCodeButton, VSCodeTextArea } from '@vscode/webview-ui-toolkit/react';

interface InputAreaProps {
    onSend: (text: string) => void;
    onImageSelect: () => void;
    onStop: () => void;
    disabled: boolean;
    isGenerating: boolean;
    selectedImage: string | null;
}

export const InputArea = ({ onSend, onImageSelect, onStop, disabled, isGenerating, selectedImage }: InputAreaProps) => {
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

    return (
        <div className="input-container" style={{
            padding: '16px 20px',
            backgroundColor: 'transparent',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
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
                    alignSelf: 'flex-start'
                }}>
                    <span className="codicon codicon-file-media"></span>
                    <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedImage.split(/[/\\]/).pop()}
                    </span>
                </div>
            )}

            <div className="input-box" style={{
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '12px',
                backgroundColor: 'var(--vscode-input-background)',
                padding: '12px',
                boxShadow: 'var(--shadow-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            }}>
                <VSCodeTextArea
                    value={value}
                    onInput={(e: any) => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything (Ctrl+L), @ to mention, / for workflows"
                    disabled={disabled && !isGenerating}
                    rows={2}
                    resize="none"
                    style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <VSCodeButton appearance="icon" onClick={onImageSelect} disabled={disabled || isGenerating} title="Attach Image">
                            <span className="codicon codicon-device-camera" style={{ fontSize: '16px' }}></span>
                        </VSCodeButton>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {isGenerating ? (
                            <VSCodeButton appearance="secondary" onClick={onStop} style={{ borderRadius: '20px' }}>
                                <span className="codicon codicon-debug-stop" style={{ marginRight: '6px' }}></span>
                                Stop
                            </VSCodeButton>
                        ) : (
                            <VSCodeButton onClick={handleSend} disabled={disabled || !value.trim()} style={{ borderRadius: '20px' }}>
                                Send
                            </VSCodeButton>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
