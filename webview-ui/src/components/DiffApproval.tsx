import React, { useState } from 'react';
import { DiffProposal } from '../types';
import { vscode } from '../utilities/vscode';

interface DiffApprovalProps {
    proposal: DiffProposal;
}

/**
 * UI for reviewing and approving AI-generated code changes.
 * Supports structured reasoning display and partial hunk selection.
 */
export const DiffApproval: React.FC<DiffApprovalProps> = ({ proposal }) => {
    // Track which hunks the user wants to apply
    const [selectedHunkIds, setSelectedHunkIds] = useState<string[]>(
        proposal.hunks.map(h => h.id)
    );

    const toggleHunk = (id: string) => {
        setSelectedHunkIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleApprove = () => {
        vscode.postMessage({
            command: 'approve',
            selectedHunkIds
        });
    };

    const handleReject = () => {
        // We close the panel on reject
        vscode.postMessage({
            command: 'reject'
        });
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            overflow: 'hidden',
            backgroundColor: 'var(--vscode-editor-background)',
            color: 'var(--vscode-editor-foreground)'
        }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                <header style={{
                    borderBottom: '1px solid var(--vscode-widget-border)',
                    paddingBottom: '12px',
                    marginBottom: '16px'
                }}>
                    <h1 style={{ fontSize: '1.2em', margin: '0 0 4px 0' }}>Approve Changes</h1>
                    <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{proposal.fileName}</div>
                </header>

                {/* Structured Reasoning Section */}
                <section style={{ marginBottom: '24px' }}>
                    <h2 style={{
                        fontSize: '1em',
                        marginBottom: '8px',
                        color: 'var(--vscode-symbolIcon-propertyForeground)',
                        fontWeight: 600
                    }}>AI Reasoning</h2>
                    <div style={{
                        backgroundColor: 'var(--vscode-editor-inactiveSelectionBackground)',
                        padding: '12px',
                        borderRadius: '4px',
                        fontSize: '0.9em',
                        lineHeight: '1.4'
                    }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>What changed:</div>
                        <ul style={{ margin: '0 0 12px 0', paddingLeft: '20px' }}>
                            {proposal.reasoning.what.map((item, i) => <li key={i}>{item}</li>)}
                        </ul>
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Why:</div>
                        <p style={{ margin: 0 }}>{proposal.reasoning.why}</p>
                    </div>
                </section>

                {/* Hunk List Section */}
                <section>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px'
                    }}>
                        <h2 style={{ fontSize: '1em', margin: 0, fontWeight: 600 }}>Proposed Code Changes</h2>
                        <span style={{ fontSize: '0.8em', opacity: 0.6 }}>
                            {selectedHunkIds.length} of {proposal.hunks.length} hunks selected
                        </span>
                    </div>

                    {proposal.hunks.map(hunk => (
                        <div key={hunk.id} style={{
                            border: '1px solid var(--vscode-widget-border)',
                            borderRadius: '4px',
                            marginBottom: '12px',
                            overflow: 'hidden',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '6px 10px',
                                backgroundColor: 'var(--vscode-list-hoverBackground)',
                                borderBottom: '1px solid var(--vscode-widget-border)'
                            }}>
                                <input
                                    type="checkbox"
                                    id={`hunk-${hunk.id}`}
                                    checked={selectedHunkIds.includes(hunk.id)}
                                    onChange={() => toggleHunk(hunk.id)}
                                    style={{ cursor: 'pointer' }}
                                />
                                <label
                                    htmlFor={`hunk-${hunk.id}`}
                                    style={{ fontSize: '0.8em', fontFamily: 'monospace', opacity: 0.8, cursor: 'pointer' }}
                                >
                                    {hunk.header}
                                </label>
                            </div>
                            <div style={{
                                padding: '8px',
                                fontFamily: 'var(--vscode-editor-font-family)',
                                fontSize: '12px',
                                overflowX: 'auto',
                                whiteSpace: 'pre',
                                backgroundColor: 'var(--vscode-editor-background)'
                            }}>
                                {hunk.lines.map((line, i) => {
                                    const isAdded = line.startsWith('+');
                                    const isRemoved = line.startsWith('-');
                                    return (
                                        <div key={i} style={{
                                            backgroundColor: isAdded ? 'rgba(0, 255, 0, 0.15)' : isRemoved ? 'rgba(255, 0, 0, 0.15)' : 'transparent',
                                            color: isAdded ? '#4ec9b0' : isRemoved ? '#ce9178' : 'inherit',
                                            padding: '0 4px',
                                            display: 'block',
                                            minWidth: 'fit-content'
                                        }}>
                                            {line}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </section>
            </div>

            <footer style={{
                padding: '12px 16px',
                borderTop: '1px solid var(--vscode-widget-border)',
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
                backgroundColor: 'var(--vscode-sideBar-background)'
            }}>
                <button
                    onClick={handleReject}
                    style={{
                        padding: '6px 16px',
                        border: '1px solid var(--vscode-button-border, transparent)',
                        borderRadius: '2px',
                        backgroundColor: 'var(--vscode-button-secondaryBackground)',
                        color: 'var(--vscode-button-secondaryForeground)',
                        cursor: 'pointer',
                        fontSize: '0.9em'
                    }}
                >
                    Reject
                </button>
                <button
                    onClick={handleApprove}
                    disabled={selectedHunkIds.length === 0}
                    style={{
                        padding: '6px 16px',
                        border: 'none',
                        borderRadius: '2px',
                        backgroundColor: 'var(--vscode-button-background)',
                        color: 'var(--vscode-button-foreground)',
                        cursor: selectedHunkIds.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: selectedHunkIds.length === 0 ? 0.5 : 1,
                        fontSize: '0.9em',
                        fontWeight: 600
                    }}
                >
                    {selectedHunkIds.length === proposal.hunks.length ? 'Accept All' : 'Apply Selected'}
                </button>
            </footer>
        </div>
    );
};
