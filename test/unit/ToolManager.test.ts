import * as vscode from 'vscode';
import { ToolManager } from '../../src/tools/ToolManager';

describe('ToolManager workspace path security', () => {
    let toolManager: ToolManager;
    let terminalService: any;
    let inlineApplyService: any;

    beforeEach(() => {
        jest.clearAllMocks();

        terminalService = {
            runWithConfirmation: jest.fn(),
        };

        inlineApplyService = {
            proposeChange: jest.fn(),
        };

        toolManager = new ToolManager(
            terminalService,
            inlineApplyService
        );
    });

    it('rejects directory traversal in ls', async () => {
        const result = await toolManager.callTool('ls', {
            path: '../outside',
        });

        expect(result.isError).toBe(true);
        expect(result.output).toContain('outside the workspace');
    });

    it('rejects directory traversal in read', async () => {
        const result = await toolManager.callTool('read', {
            path: '../../secret.txt',
        });

        expect(result.isError).toBe(true);
        expect(result.output).toContain('outside the workspace');
    });

    it('rejects directory traversal in apply', async () => {
        const result = await toolManager.callTool('apply', {
            path: '../outside.ts',
            code: 'malicious code',
        });

        expect(result.isError).toBe(true);
        expect(result.output).toContain('outside the workspace');
        expect(
            inlineApplyService.proposeChange
        ).not.toHaveBeenCalled();
    });

    it('allows a valid workspace path in apply', async () => {
        inlineApplyService.proposeChange.mockResolvedValue(true);

        const result = await toolManager.callTool('apply', {
            path: 'src/example.ts',
            code: 'const example = true;',
        });

        expect(result.isError).toBe(false);
        expect(result.output).toBe('Changes accepted and applied.');

        expect(
            inlineApplyService.proposeChange
        ).toHaveBeenCalledWith(
            expect.stringContaining('src'),
            'const example = true;'
        );
    });

    it('rejects empty paths', async () => {
        const result = await toolManager.callTool('read', {
            path: '',
        });

        expect(result.isError).toBe(true);
        expect(result.output).toContain('valid file path');
    });
});