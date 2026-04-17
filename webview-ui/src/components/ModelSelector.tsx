import React, { useState, useRef, useEffect } from 'react';

interface ModelSelectorProps {
    models: string[];
    current: string;
    onSelect: (model: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ models, current, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getPill = (model: string) => {
        const m = model.toLowerCase();
        if (m.includes('pro')) return { text: 'Premium', color: 'hsl(190, 100%, 50%)' };
        if (m.includes('flash')) return { text: 'Fast', color: 'hsl(140, 80%, 50%)' };
        if (m.includes('thought') || m.includes('coder')) return { text: 'Logic', color: 'hsl(280, 80%, 60%)' };
        return null;
    };

    return (
        <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
            {/* The Trigger Badge */}
            <div 
                className="clickable animate-pulse-subtle"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    background: 'var(--bg-surface-lighter)',
                    borderRadius: '8px',
                    border: isOpen ? '1px solid var(--accent-primary)' : '1px solid var(--border-base)',
                    color: 'var(--text-main)',
                    fontSize: '11px',
                    fontWeight: 500,
                    transition: 'all 0.2s ease',
                    boxShadow: isOpen ? '0 0 10px hsla(190, 100%, 50%, 0.2)' : 'none'
                }}
            >
                <span className="codicon codicon-sparkle" style={{ fontSize: '12px', color: 'var(--accent-primary)' }}></span>
                <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {current}
                </span>
                <span className={`codicon ${isOpen ? 'codicon-chevron-up' : 'codicon-chevron-down'}`} style={{ fontSize: '10px', opacity: 0.6 }}></span>
            </div>

            {/* The Floating Menu (Reference Match) */}
            {isOpen && (
                <div 
                    className="glass-dark animate-slide-up"
                    style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 12px)',
                        left: '0',
                        width: '240px',
                        background: 'hsl(220, 15%, 7%)',
                        borderRadius: '12px',
                        border: '1px solid var(--border-base)',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                        zIndex: 1000,
                        padding: '6px',
                        overflow: 'hidden'
                    }}
                >
                    <div style={{ padding: '8px 12px 4px 12px', fontSize: '10px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Model
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '300px', overflowY: 'auto', padding: '4px 0' }}>
                        {models.map(model => {
                            const isSelected = model === current;
                            const tag = getPill(model);
                            
                            return (
                                <div 
                                    key={model}
                                    className="clickable"
                                    onClick={() => {
                                        onSelect(model);
                                        setIsOpen(false);
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        background: isSelected ? 'hsla(190, 100%, 50%, 0.1)' : 'transparent',
                                        border: isSelected ? '1px solid var(--accent-primary)' : '1px solid transparent',
                                        transition: 'all 0.1s ease',
                                        color: isSelected ? 'var(--text-main)' : 'var(--text-dim)'
                                    }}
                                >
                                    <span style={{ fontSize: '12px', fontWeight: isSelected ? 600 : 400 }}>{model}</span>
                                    {tag && (
                                        <span style={{ 
                                            fontSize: '9px', 
                                            padding: '1px 6px', 
                                            borderRadius: '4px', 
                                            background: 'var(--bg-surface-lighter)', 
                                            color: tag.color,
                                            border: `1px solid ${tag.color}44`,
                                            fontWeight: 600,
                                            letterSpacing: '0.3px'
                                        }}>
                                            {tag.text}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
