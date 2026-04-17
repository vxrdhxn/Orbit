import React from 'react';
import { vscode } from '../utilities/vscode';

export interface ChatSessionMetadata {
  id: string;
  title: string;
  lastModified: number;
  messageCount: number;
}

interface ChatHistoryProps {
  sessions: ChatSessionMetadata[];
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({ sessions, onSelect, onNewChat, onDelete }) => {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 24 * 60 * 60 * 1000) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: 'var(--bg-main)',
      padding: '24px 16px',
      gap: '24px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.4em', fontWeight: 600, letterSpacing: '-0.5px' }}>History</h2>
        <button 
          className="clickable"
          onClick={onNewChat}
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'black',
            border: 'none',
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            fontSize: '11px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: 'var(--shadow-glow)'
          }}
        >
          <span className="codicon codicon-add"></span>
          New Chat
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {sessions.length === 0 ? (
          <div style={{ 
            marginTop: '40px',
            textAlign: 'center',
            color: 'var(--text-dim)',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            alignItems: 'center'
          }}>
            <span className="codicon codicon-history" style={{ fontSize: '24px', opacity: 0.3 }}></span>
            No recent chats found.
          </div>
        ) : (
          sessions.map(session => (
            <div 
              key={session.id}
              className="glass clickable animate-slide-up"
              onClick={() => onSelect(session.id)}
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-base)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                position: 'relative',
                transition: 'var(--transition-smooth)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ 
                  fontWeight: 600, 
                  fontSize: '13px', 
                  color: 'var(--text-main)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '70%'
                }}>
                  {session.title}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                  {formatDate(session.lastModified)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.6, fontSize: '11px' }}>
                    <span className="codicon codicon-comment" style={{ fontSize: '10px' }}></span>
                    {session.messageCount} messages
                 </div>
                 
                 <button 
                   className="clickable"
                   onClick={(e) => {
                     e.stopPropagation();
                     onDelete(session.id);
                   }}
                   title="Delete Chat"
                   style={{
                     padding: '4px',
                     borderRadius: '4px',
                     color: 'var(--text-dim)',
                   }}
                 >
                    <span className="codicon codicon-trash" style={{ fontSize: '12px' }}></span>
                 </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
