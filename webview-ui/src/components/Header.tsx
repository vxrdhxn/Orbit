import { VSCodeButton, VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react';

interface HeaderProps {
    models: string[];
    currentModel: string;
    onModelChange: (model: string) => void;
    onShowHistory: () => void;
    onNewChat: () => void;
}

export const Header = ({ models, currentModel, onModelChange, onShowHistory, onNewChat }: HeaderProps) => {
    return (
        <div className="glass" style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid var(--vscode-widget-border)',
            gap: '12px',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 10,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                <span className="codicon codicon-robot" style={{ fontSize: '18px', opacity: 0.8 }}></span>
                <VSCodeDropdown
                    value={currentModel}
                    onInput={(e: any) => onModelChange(e.target.value)}
                    style={{ minWidth: '160px', zIndex: 11 }}
                >
                    {models.map(model => (
                        <VSCodeOption key={model} value={model}>{model}</VSCodeOption>
                    ))}
                </VSCodeDropdown>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
                <VSCodeButton appearance="icon" onClick={onShowHistory} title="Chat History">
                    <span className="codicon codicon-history"></span>
                </VSCodeButton>
                <VSCodeButton appearance="icon" onClick={onNewChat} title="New Chat">
                    <span className="codicon codicon-add"></span>
                </VSCodeButton>
            </div>
        </div>
    );
};
