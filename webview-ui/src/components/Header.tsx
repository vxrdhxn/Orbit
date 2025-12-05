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
        <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px',
            borderBottom: '1px solid var(--vscode-widget-border)',
            gap: '10px',
            justifyContent: 'space-between'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                <VSCodeDropdown
                    value={currentModel}
                    onChange={(e: any) => onModelChange(e.target.value)}
                    style={{ minWidth: '150px' }}
                >
                    {models.map(model => (
                        <VSCodeOption key={model} value={model}>{model}</VSCodeOption>
                    ))}
                </VSCodeDropdown>
            </div>
            <div style={{ display: 'flex', gap: '5px' }}>
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
