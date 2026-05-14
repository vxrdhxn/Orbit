import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
  /** Optional key or prop to trigger automatic recovery when it changes */
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public componentDidUpdate(prevProps: Props) {
    // Auto-recover when resetKey changes (e.g., message count changes)
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', justifyContent: 'center', minHeight: '100px' }}>
          <div style={{ color: 'var(--text-muted, #999)', fontSize: '12px', textAlign: 'center' }}>
            ⚠️ A rendering error occurred.
          </div>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border-base, #333)',
              background: 'var(--bg-surface, #1e1e1e)',
              color: 'var(--text-main, #ccc)',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Retry
          </button>
          <pre style={{ fontSize: '10px', color: 'var(--text-dim, #666)', maxWidth: '100%', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {this.state.error?.message}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
