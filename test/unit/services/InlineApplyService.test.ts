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

    it('should propose changes by writing to actual file and opening diff', async () => {
        // 1. Setup mocks
        const targetPath = '/test/file.ts';
        const originalContent = 'original';
        const proposedContent = 'proposed';

        (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(Buffer.from(originalContent));
        (vscode.workspace.fs.writeFile as jest.Mock).mockResolvedValue(undefined);
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
        
        // Mock the user clicking "Accept"
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Accept ✓');

        // 2. Trigger proposal
        const accepted = await service.proposeChange(targetPath, proposedContent);

        // 3. Verify
        expect(vscode.workspace.fs.readFile).toHaveBeenCalled();
        expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('vscode.diff', expect.anything(), expect.anything(), expect.anything(), expect.anything());
        expect(accepted).toBe(true);
    });

    it('should restore original content if rejected', async () => {
        const targetPath = '/test/file.ts';
        (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('original'));
        (vscode.workspace.fs.writeFile as jest.Mock).mockResolvedValue(undefined);
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Reject ✗');

        const accepted = await service.proposeChange(targetPath, 'proposed');

        expect(accepted).toBe(false);
        // Last call should be restoring original content
        expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
    });
});
