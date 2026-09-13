import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { InlineApplyService } from '../../../src/services/InlineApplyService';

jest.mock('vscode', () => ({
    Uri: {
        file: jest.fn((p) => ({ fsPath: p, scheme: 'file' }))
    },
    workspace: {
        fs: {
            readFile: jest.fn(),
            writeFile: jest.fn()
        },
        textDocuments: []
    },
    window: {
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn()
    },
    commands: {
        executeCommand: jest.fn()
    }
}), { virtual: true });

jest.mock('fs', () => ({
    writeFileSync: jest.fn(),
    unlinkSync: jest.fn(),
    promises: {
        writeFile: jest.fn()
    }
}));

describe('InlineApplyService', () => {
    let service: InlineApplyService;

    beforeEach(() => {
        service = new InlineApplyService();
        jest.clearAllMocks();
    });

    it('should accept changes and write the proposed content to the actual file', async () => {
        const targetPath = '/test/file.ts';
        const originalContent = 'original';
        const proposedContent = 'proposed';

        (vscode.workspace.fs.readFile as jest.Mock)
            .mockResolvedValue(Buffer.from(originalContent));

        (vscode.workspace.fs.writeFile as jest.Mock)
            .mockResolvedValue(undefined);

        (vscode.commands.executeCommand as jest.Mock)
            .mockResolvedValue(undefined);

        (vscode.window.showInformationMessage as jest.Mock)
            .mockResolvedValue('Accept ✓');

        const accepted = await service.proposeChange(
            targetPath,
            proposedContent
        );

        expect(accepted).toBe(true);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.diff',
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.anything()
        );

        expect(vscode.workspace.fs.writeFile).toHaveBeenCalledTimes(1);
        expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
            expect.objectContaining({
                fsPath: targetPath
            }),
            expect.anything()
        );
    });

    it('should reject changes without modifying the actual file', async () => {
        const targetPath = '/test/file.ts';
        const originalContent = 'original';
        const proposedContent = 'proposed';

        (vscode.workspace.fs.readFile as jest.Mock)
            .mockResolvedValue(Buffer.from(originalContent));

        (vscode.workspace.fs.writeFile as jest.Mock)
            .mockResolvedValue(undefined);

        (vscode.commands.executeCommand as jest.Mock)
            .mockResolvedValue(undefined);

        (vscode.window.showInformationMessage as jest.Mock)
            .mockResolvedValue('Reject ✕');

        const accepted = await service.proposeChange(
            targetPath,
            proposedContent
        );

        expect(accepted).toBe(false);

        expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    });

    it('should not apply changes if the file changed after the proposal was created', async () => {
        const targetPath = '/test/file.ts';
        const originalContent = 'original';
        const changedContent = 'changed by user';
        const proposedContent = 'proposed';

        (vscode.workspace.fs.readFile as jest.Mock)
            .mockResolvedValueOnce(Buffer.from(originalContent))
            .mockResolvedValueOnce(Buffer.from(changedContent));

        (vscode.workspace.fs.writeFile as jest.Mock)
            .mockResolvedValue(undefined);

        (vscode.commands.executeCommand as jest.Mock)
            .mockResolvedValue(undefined);

        (vscode.window.showInformationMessage as jest.Mock)
            .mockResolvedValue('Accept ✓');

        const accepted = await service.proposeChange(
            targetPath,
            proposedContent
        );

        expect(accepted).toBe(false);

        expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            expect.stringContaining(
                'The file changed while the proposal was open'
            )
        );
    });
});