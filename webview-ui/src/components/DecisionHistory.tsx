import React, { useState, useMemo } from 'react';
import { vscode } from '../utilities/vscode';
import { StructuredReasoning } from './StructuredReasoning';

interface DecisionRecord {
    id: string;
    timestamp: number;
    file_path: string;
    change_type: string;
    what: string[];
    why: string;
    improvements: string;
    tradeoffs: string;
    production: string;
}

interface DecisionHistoryProps {
    decisions: DecisionRecord[];
}

export const DecisionHistory: React.FC<DecisionHistoryProps> = ({ decisions }) => {
    const [filter, setFilter] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const filteredDecisions = useMemo(() => {
        return decisions.filter(d =>
            d.file_path.toLowerCase().includes(filter.toLowerCase()) ||
            d.change_type.toLowerCase().includes(filter.toLowerCase())
        );
    }, [decisions, filter]);

    const handleNavigate = (path: string) => {
        vscode.postMessage({ type: 'navigateToFile', value: path });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px', padding: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '1.2em' }}>Decision History</h2>
                <div style={{ position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="Filter by file or type..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            backgroundColor: 'var(--vscode-input-background)',
                            color: 'var(--vscode-input-foreground)',
                            border: '1px solid var(--vscode-input-border)',
                            borderRadius: '4px',
                            outline: 'none'
                        }}
                    />
                    {filter && (
                        <span
                            className="codicon codicon-close"
                            onClick={() => setFilter('')}
                            style={{
                                position: 'absolute',
                                right: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                cursor: 'pointer',
                                opacity: 0.6
                            }}
                        />
                    )}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredDecisions.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', opacity: 0.6 }}>
                        No decisions found matching filter.
                    </div>
                ) : (
                    <>
                        {filteredDecisions.map(decision => (
                            <div
                                key={decision.id}
                                style={{
                                    border: '1px solid var(--vscode-widget-border)',
                                    borderRadius: '6px',
                                    overflow: 'hidden',
                                    backgroundColor: 'var(--vscode-sideBar-background)'
                                }}
                            >
                                <div
                                    onClick={() => setSelectedId(selectedId === decision.id ? null : decision.id)}
                                    style={{
                                        padding: '10px 12px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '4px'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--vscode-textLink-foreground)' }}>
                                            {decision.change_type}
                                        </span>
                                        <span style={{ fontSize: '0.8em', opacity: 0.6 }}>
                                            {new Date(decision.timestamp).toLocaleString()}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.9em', opacity: 0.8, wordBreak: 'break-all' }}>
                                        {decision.file_path}
                                    </div>
                                </div>

                                {selectedId === decision.id && (
                                    <div style={{ padding: '12px', borderTop: '1px solid var(--vscode-widget-border)', backgroundColor: 'var(--vscode-editor-background)' }}>
                                        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                                            <button
                                                onClick={() => handleNavigate(decision.file_path)}
                                                style={{
                                                    backgroundColor: 'var(--vscode-button-secondaryBackground)',
                                                    color: 'var(--vscode-button-secondaryForeground)',
                                                    border: 'none',
                                                    padding: '4px 12px',
                                                    borderRadius: '2px',
                                                    cursor: 'pointer',
                                                    fontSize: '0.9em'
                                                }}
                                            >
                                                Go to File
                                            </button>
                                        </div>
                                        <StructuredReasoning reasoning={{
                                            what: decision.what,
                                            why: decision.why,
                                            improvements: decision.improvements,
                                            tradeoffs: decision.tradeoffs,
                                            production: decision.production
                                        }} />
                                    </div>
                                )}
                            </div>
                        ))}
                        {!filter && decisions.length >= 50 && (
                            <button
                                onClick={() => vscode.postMessage({ type: 'fetchMoreDecisions', offset: decisions.length })}
                                style={{
                                    backgroundColor: 'transparent',
                                    color: 'var(--vscode-textLink-foreground)',
                                    border: '1px solid var(--vscode-textLink-foreground)',
                                    padding: '8px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    marginTop: '8px'
                                }}
                            >
                                Load More Decisions
                            </button>
                        )}
                    </>
                )}
            </div>

            <button
                onClick={() => vscode.postMessage({ type: 'closeHistory' })}
                style={{
                    backgroundColor: 'var(--vscode-button-background)',
                    color: 'var(--vscode-button-foreground)',
                    border: 'none',
                    padding: '8px',
                    borderRadius: '2px',
                    cursor: 'pointer'
                }}
            >
                Back to Chat
            </button>
        </div>
    );
};
