import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import App from '../App';
import { vscode } from '../utilities/vscode';
import { useOrbitStore } from '../store/useOrbitStore';

// Mock the VSCode API wrapper
vi.mock('../utilities/vscode', () => ({
    vscode: {
        postMessage: vi.fn(),
        getState: vi.fn(),
        setState: vi.fn(),
    }
}));

// Mock ResizeObserver for some React components
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

describe('App Webview UI', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset Zustand store state
        useOrbitStore.setState({
            view: 'chat',
            messages: [],
            isGenerating: false,
            models: ['Model A', 'Model B'],
            currentModel: 'Model A',
            connectionState: 'Connected'
        });
    });

    it('renders the initial state correctly', () => {
        render(<App />);
        expect(screen.getByText('Orbit')).toBeInTheDocument();
        expect(screen.getByText('Code at the speed of thought')).toBeInTheDocument();
    });

    it('sends an IPC message when a user sends a chat', async () => {
        render(<App />);
        
        // Find the input text area (from InputArea component)
        const textarea = screen.getByPlaceholderText(/Ask Orbit/i);
        
        // Type a message
        fireEvent.change(textarea, { target: { value: 'Hello Orbit' } });
        
        // Find the send button (it has a submit icon, maybe by testid or class, assuming we can find the button)
        // For simplicity, let's just submit the textarea by pressing Enter if it supports it, or finding the button.
        // Assuming there is a button with a specific title or we can trigger the form submission.
        // Let's use getByTitle or similar, if not we can use container query.
        const sendButton = screen.getByTitle(/Send message/i);
        fireEvent.click(sendButton);

        await waitFor(() => {
            expect(vscode.postMessage).toHaveBeenCalledWith({ type: 'sendMessage', value: 'Hello Orbit' });
        });
    });

    it('updates UI when receiving IPC addResponse message', async () => {
        render(<App />);
        
        // Dispatch message event to simulate receiving a message from the extension
        window.dispatchEvent(new MessageEvent('message', {
            data: { type: 'addResponse', value: 'This is an AI response' }
        }));

        await waitFor(() => {
            expect(screen.getByText('This is an AI response')).toBeInTheDocument();
        });
    });
});
