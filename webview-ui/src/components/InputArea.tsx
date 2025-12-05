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
            padding: '15px',
            backgroundColor: 'var(--vscode-editor-background)',
            borderTop: '1px solid var(--vscode-widget-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        }}>
            {selectedImage && (
                <div style={{
                    fontSize: '0.85em',
                    color: 'var(--vscode-textLink-foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                }}>
                    <span className="codicon codicon-file-media"></span>
                    {selectedImage.split(/[/\\]/).pop()}
                </div>
            )}

            <div className="input-box" style={{
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '10px',
                backgroundColor: 'var(--vscode-input-background)',
                padding: '10px'
            }}>
                <VSCodeTextArea
                    value={value}
                    onInput={(e: any) => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything (Ctrl+L), @ to mention, / for workflows"
                    disabled={disabled && !isGenerating} // Disable checking only if disabled AND not generating (logic check?)
                    // Actually, we want to disable input only if we strictly can't type. 
                    // Usually we invoke onStop if generating.
                    rows={2}
                    resize="none"
                    style={{ width: '100%', border: 'none', background: 'transparent' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '5px' }}>
                        <VSCodeButton appearance="icon" onClick={onImageSelect} disabled={disabled || isGenerating} title="Attach Image">
                            <span className="codicon codicon-device-camera"></span>
                        </VSCodeButton>
                    </div>
                    <div style={{ display: 'flex', gap: '5px' }}>
                        {isGenerating ? (
                            <VSCodeButton appearance="secondary" onClick={onStop}>
                                <span className="codicon codicon-debug-stop" style={{ marginRight: '5px' }}></span>
                                Stop
                            </VSCodeButton>
                        ) : (
                            <VSCodeButton onClick={handleSend} disabled={disabled || !value.trim()}>
                                Send
                            </VSCodeButton>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
