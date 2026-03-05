import * as vscode from 'vscode';
import { DecisionHistoryView } from '../../ui/DecisionHistoryView';

// Simple mock for vscode
jest.mock('vscode', () => ({
    Uri: {
        joinPath: jest.fn((uri, ...parts) => ({ fsPath: parts.join('/') })),
        file: jest.fn(path => ({ fsPath: path }))
    },
    window: {
        createWebviewPanel: jest.fn(() => ({
            onDidDispose: jest.fn(),
            webview: {
                onDidReceiveMessage: jest.fn(),
                asWebviewUri: jest.fn(uri => uri.fsPath),
                postMessage: jest.fn(),
                html: ''
            },
            reveal: jest.fn(),
            dispose: jest.fn()
        }))
    },
    ViewColumn: {
        One: 1
    }
}));

describe('DecisionHistoryView', () => {
    let historyView: DecisionHistoryView;
    const mockUri = {} as vscode.Uri;

    beforeEach(() => {
        historyView = new DecisionHistoryView(mockUri, jest.fn());
    });

    test('should create webview panel on show', () => {
        const decisions = [
            { id: '1', timestamp: 123, file_path: 'a.ts', change_type: 'edit', what: '[]', why: '', improvements: '', tradeoffs: '', production: '', approved: true, project_id: 'p1' }
        ];

        // Mock fs.readFileSync
        const fs = require('fs');
        jest.spyOn(fs, 'readFileSync').mockReturnValue('<html><body><script></script></body></html>');

        historyView.show(decisions as any);

        expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
            'orbit.decisionHistory',
            'Decision History',
            1,
            expect.anything()
        );
    });
});
