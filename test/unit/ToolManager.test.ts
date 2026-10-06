import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
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

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!workspaceRoot) {
            throw new Error('Test workspace is not configured');
        }

        const sourceDir = path.join(workspaceRoot, 'src');
        const sourceFile = path.join(sourceDir, 'example.ts');

        fs.mkdirSync(sourceDir, { recursive: true });
        fs.writeFileSync(sourceFile, 'const example = false;');

        try {
            const result = await toolManager.callTool('apply', {
                path: 'src/example.ts',
                code: 'const example = true;',
            });

            expect(result.isError).toBe(false);
            expect(result.output).toBe('Changes accepted and applied.');
            expect(inlineApplyService.proposeChange).toHaveBeenCalledWith(
                expect.stringContaining('src'),
                'const example = true;'
            );
        } finally {
            fs.rmSync(sourceFile, { force: true });
            fs.rmSync(sourceDir, { recursive: true, force: true });
        }
    });

    it('rejects empty paths', async () => {
        const result = await toolManager.callTool('read', {
            path: '',
        });

        expect(result.isError).toBe(true);
        expect(result.output).toContain('valid file path');
    });

    it('rejects null tool arguments', async () => {
        const result = await toolManager.callTool('read', null);

        expect(result.isError).toBe(true);
        expect(result.output).toContain(
            'Tool arguments must be a JSON object'
        );
    });

    it('rejects array tool arguments', async () => {
        const result = await toolManager.callTool('read', []);

        expect(result.isError).toBe(true);
        expect(result.output).toContain(
            'Tool arguments must be a JSON object'
        );
    });

    it('rejects non-string search queries', async () => {
        const result = await toolManager.callTool('search', {
            query: 123,
        });

        expect(result.isError).toBe(true);
        expect(result.output).toContain(
            'query must be a non-empty string'
        );
    });

    it('rejects empty search queries', async () => {
        const result = await toolManager.callTool('search', {
            query: '   ',
        });

        expect(result.isError).toBe(true);
        expect(result.output).toContain(
            'query must be a non-empty string'
        );
    });

    it('rejects non-string run commands', async () => {
        const result = await toolManager.callTool('run', {
            command: 123,
        });

        expect(result.isError).toBe(true);
        expect(result.output).toContain(
            'command must be a non-empty string'
        );

        expect(
            terminalService.runWithConfirmation
        ).not.toHaveBeenCalled();
    });

    it('rejects empty run commands', async () => {
        const result = await toolManager.callTool('run', {
            command: '   ',
        });

        expect(result.isError).toBe(true);
        expect(result.output).toContain(
            'command must be a non-empty string'
        );

        expect(
            terminalService.runWithConfirmation
        ).not.toHaveBeenCalled();
    });

    it('rejects invalid apply code', async () => {
        const result = await toolManager.callTool('apply', {
            path: 'src/example.ts',
            code: 123,
        });

        expect(result.isError).toBe(true);
        expect(result.output).toContain(
            'code must be a non-empty string'
        );

        expect(
            inlineApplyService.proposeChange
        ).not.toHaveBeenCalled();
    });
});
