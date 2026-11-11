import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ConnectionPanel } from '../components/ConnectionPanel';
import { vscode } from '../utilities/vscode';
import { useOrbitStore } from '../store/useOrbitStore';

vi.mock('../utilities/vscode', () => ({
    vscode: { postMessage: vi.fn(), getState: vi.fn(), setState: vi.fn() }
}));

const baseConnection = {
    mode: 'cloud' as const,
    hasKey: { custom: false, groq: false, openrouter: false },
    endpoint: 'https://api.openai.com/v1',
    localServerEndpoint: 'http://localhost:1234/v1',
};

describe('ConnectionPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useOrbitStore.setState({ connection: baseConnection, connectionTest: null, testingConnection: false, connectionState: 'Connected' });
    });

    it('switches the provider when a mode is clicked', () => {
        render(<ConnectionPanel />);
        fireEvent.click(screen.getByRole('radio', { name: /Groq/ }));
        expect(vscode.postMessage).toHaveBeenCalledWith({ type: 'setMode', value: 'groq' });
    });

    it('asks for a key when the selected provider has none, and saves it', () => {
        useOrbitStore.setState({ connection: { ...baseConnection, mode: 'groq' } });
        render(<ConnectionPanel />);

        expect(screen.getByText(/Add an API key to use Groq/)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('API key'), { target: { value: '  gsk_test  ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(vscode.postMessage).toHaveBeenCalledWith({ type: 'setApiKey', provider: 'groq', value: 'gsk_test' });
    });

    it('shows a saved key without revealing it, and can remove it', () => {
        useOrbitStore.setState({ connection: { ...baseConnection, mode: 'openrouter', hasKey: { ...baseConnection.hasKey, openrouter: true } } });
        render(<ConnectionPanel />);

        expect(screen.getByText(/API key saved \(encrypted\)/)).toBeInTheDocument();
        expect(screen.queryByLabelText('API key')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
        expect(vscode.postMessage).toHaveBeenCalledWith({ type: 'clearApiKey', provider: 'openrouter' });
    });

    it('edits the local server URL and tests the connection', () => {
        useOrbitStore.setState({ connection: { ...baseConnection, mode: 'local-server' } });
        render(<ConnectionPanel />);

        fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: 'http://localhost:11434/v1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(vscode.postMessage).toHaveBeenCalledWith({ type: 'setEndpoint', field: 'localServer', value: 'http://localhost:11434/v1' });

        fireEvent.click(screen.getByRole('button', { name: /Test connection/ }));
        expect(vscode.postMessage).toHaveBeenCalledWith({ type: 'testConnection' });
    });
});
