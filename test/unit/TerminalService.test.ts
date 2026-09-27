import * as vscode from 'vscode';
import { TerminalService } from '../../src/services/TerminalService';

describe('TerminalService', () => {
    let service: TerminalService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new TerminalService();
    });

    it('should reject an empty command', async () => {
        await expect(service.execute('')).rejects.toThrow(
            'Command cannot be empty.'
        );
    });

    it('should reject whitespace-only commands', async () => {
        await expect(service.execute('   ')).rejects.toThrow(
            'Command cannot be empty.'
        );
    });

    it('should reject a working directory outside the workspace', async () => {
        await expect(
            service.execute('echo test', 'C:\\outside')
        ).rejects.toThrow(
            'Access denied: working directory is outside the workspace.'
        );
    });

    it('should reject a parent directory outside the workspace', async () => {
        await expect(
            service.execute('echo test', '/mock/root/../outside')
        ).rejects.toThrow(
            'Access denied: working directory is outside the workspace.'
        );
    });

    it('should reject execution when no workspace is open', async () => {
        const workspace = vscode.workspace as {
            workspaceFolders: unknown;
        };

        const originalWorkspaceFolders = workspace.workspaceFolders;
        workspace.workspaceFolders = undefined;

        await expect(service.execute('echo test')).rejects.toThrow(
            'No workspace is open.'
        );

        workspace.workspaceFolders = originalWorkspaceFolders;
    });
});