import * as vscode from 'vscode';
import { TerminalService } from '../../src/services/TerminalService';

describe('TerminalService', () => {
    let service: TerminalService;

    beforeEach(() => {
        jest.clearAllMocks();

        (
            vscode.workspace as {
                workspaceFolders: unknown;
            }
        ).workspaceFolders = [
            {
                uri: { fsPath: '/mock/root', scheme: 'file' },
                name: 'mock',
                index: 0
            }
        ];

        service = new TerminalService();
    });

    it('should reject an empty command', async () => {
        (
            vscode.window.showWarningMessage as jest.Mock
        ).mockResolvedValue('Run');

        await expect(service.runWithConfirmation('')).rejects.toThrow(
            'Command cannot be empty.'
        );
    });

    it('should reject whitespace-only commands', async () => {
        (
            vscode.window.showWarningMessage as jest.Mock
        ).mockResolvedValue('Run');

        await expect(service.runWithConfirmation('   ')).rejects.toThrow(
            'Command cannot be empty.'
        );
    });

    it('should reject a working directory outside the workspace', async () => {
        (
            vscode.window.showWarningMessage as jest.Mock
        ).mockResolvedValue('Run');

        await expect(
            service.runWithConfirmation('echo test', 'C:\\outside')
        ).rejects.toThrow(
            'Access denied: working directory is outside the workspace.'
        );

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('should reject a parent directory outside the workspace', async () => {
        (
            vscode.window.showWarningMessage as jest.Mock
        ).mockResolvedValue('Run');

        await expect(
            service.runWithConfirmation(
                'echo test',
                '/mock/root/../outside'
            )
        ).rejects.toThrow(
            'Access denied: working directory is outside the workspace.'
        );

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('should reject execution when no workspace is open', async () => {
        const workspace = vscode.workspace as {
            workspaceFolders: unknown;
        };

        workspace.workspaceFolders = undefined;

        (
            vscode.window.showWarningMessage as jest.Mock
        ).mockResolvedValue('Run');

        await expect(
            service.runWithConfirmation('echo test')
        ).rejects.toThrow('No workspace is open.');

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('should not execute when the user cancels', async () => {
        (
            vscode.window.showWarningMessage as jest.Mock
        ).mockResolvedValue('Cancel');

        const result = await service.runWithConfirmation('echo test');

        expect(result).toBeNull();
    });

    it('should execute when the user confirms', async () => {
        (
            vscode.window.showWarningMessage as jest.Mock
        ).mockResolvedValue('Run');

        (
            vscode.workspace as {
                workspaceFolders: unknown;
            }
        ).workspaceFolders = [
            {
                uri: {
                    fsPath: process.cwd(),
                    scheme: 'file'
                },
                name: 'test',
                index: 0
            }
        ];

        const result = await service.runWithConfirmation('node -p 1');

        expect(result).not.toBeNull();
        expect(result?.stdout.trim()).toBe('1');
        expect(result?.exitCode).toBe(0);
    });

    it('should return a failed command result when execution exits non-zero', async () => {
        (
            vscode.window.showWarningMessage as jest.Mock
        ).mockResolvedValue('Run');

        const result = await service.runWithConfirmation(
            'node -e "process.stderr.write(\'failure\'); process.exit(2)"'
        );

        expect(result).not.toBeNull();
        expect(result?.stderr).toContain('failure');
        expect(result?.exitCode).toBe(2);
    });

    it('should accept a working directory inside the workspace', async () => {
        (
            vscode.window.showWarningMessage as jest.Mock
        ).mockResolvedValue('Run');

        const result = await service.runWithConfirmation(
            'node -p process.cwd()',
            '/mock/root/src'
        );

        // The mocked workspace path does not necessarily exist on disk,
        // so execution may fail at the OS level. The important assertion
        // is that validation itself does not reject the path.
        expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    });

    it('should not create a terminal when the user cancels', async () => {
        (
            vscode.window.showWarningMessage as jest.Mock
        ).mockResolvedValue('Cancel');

        const result = await service.runInTerminal(
            'echo test'
        );

        expect(result).toBeNull();
        expect(vscode.window.createTerminal).not.toHaveBeenCalled();
    });

    it('should create and run a terminal when the user confirms', async () => {
        (
            vscode.window.showWarningMessage as jest.Mock
        ).mockResolvedValue('Run');

        const terminal = {
            show: jest.fn(),
            sendText: jest.fn()
        };

        (
            vscode.window.createTerminal as jest.Mock
        ).mockReturnValue(terminal);

        const result = await service.runInTerminal(
            'echo test',
            'Orbit Test'
        );

        expect(result).toBe(terminal);

        expect(vscode.window.createTerminal).toHaveBeenCalledWith({
            name: 'Orbit Test',
            cwd: expect.any(String)
        });

        const terminalOptions = (
            vscode.window.createTerminal as jest.Mock
        ).mock.calls[0][0];

        expect(terminalOptions.cwd).toMatch(/mock[\\/]root$/);

        expect(terminal.show).toHaveBeenCalled();
        expect(terminal.sendText).toHaveBeenCalledWith('echo test');
    });
});