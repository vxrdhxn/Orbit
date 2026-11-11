import * as vscode from 'vscode';
import { InlineApplyService } from '../../../src/services/InlineApplyService';
import { computeSegments, render } from '../../../src/services/inlineDiff';

// A minimal in-memory text document that applyEdit replaces in full.
function makeDocument(text: string, fsPath = '/test/file.ts') {
    return {
        text,
        uri: { fsPath, scheme: 'file' },
        eol: 1,
        isDirty: false,
        getText() { return this.text; },
        positionAt(offset: number) { return offset; },
        save: jest.fn(() => Promise.resolve(true)),
    };
}

let currentDocument: ReturnType<typeof makeDocument>;

jest.mock('vscode', () => ({
    Uri: { file: jest.fn((p: string) => ({ fsPath: p, scheme: 'file' })) },
    EndOfLine: { LF: 1, CRLF: 2 },
    TextEditorRevealType: { InCenterIfOutsideViewport: 2 },
    Position: class { constructor(public line: number, public character: number) {} },
    Range: class { constructor(public start: any, public end: any) {} },
    WorkspaceEdit: class {
        edits: any[] = [];
        replace(uri: any, range: any, text: string) { this.edits.push({ uri, range, text }); }
    },
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/test', scheme: 'file' } }],
        fs: {
            stat: jest.fn(),
            writeFile: jest.fn(),
            createDirectory: jest.fn(),
            delete: jest.fn(),
        },
        openTextDocument: jest.fn(),
        applyEdit: jest.fn(),
    },
    window: {
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showTextDocument: jest.fn(),
        visibleTextEditors: [],
    },
    commands: { executeCommand: jest.fn(() => Promise.resolve()) },
}), { virtual: true });

jest.mock('fs', () => ({
    promises: { realpath: jest.fn((p: string) => Promise.resolve(p)) },
}));

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('inlineDiff', () => {
    it('shows removed then added lines for a pending change', () => {
        const segments = computeSegments('a\nb\nc', 'a\nB\nc');
        const result = render(segments);
        expect(result.lines).toEqual(['a', 'b', 'B', 'c']);
        expect(result.removedLines).toEqual([1]);
        expect(result.addedLines).toEqual([2]);
        expect(result.hunks).toEqual([{ index: 0, startLine: 1, decision: 'pending' }]);
    });

    it('keeps added lines when accepted and removed lines when rejected', () => {
        const segments = computeSegments('a\nb', 'a\nB');
        (segments[1] as any).decision = 'accepted';
        expect(render(segments).lines).toEqual(['a', 'B']);
        (segments[1] as any).decision = 'rejected';
        expect(render(segments).lines).toEqual(['a', 'b']);
    });
});

describe('InlineApplyService', () => {
    let service: InlineApplyService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new InlineApplyService();
        currentDocument = makeDocument('original');
        (vscode.workspace.fs.stat as jest.Mock).mockResolvedValue({});
        (vscode.workspace.openTextDocument as jest.Mock).mockImplementation(() => Promise.resolve(currentDocument));
        (vscode.workspace.applyEdit as jest.Mock).mockImplementation((edit: any) => {
            currentDocument.text = edit.edits[0].text;
            return Promise.resolve(true);
        });
        (vscode.window.showTextDocument as jest.Mock).mockResolvedValue({ revealRange: jest.fn(), setDecorations: jest.fn() });
    });

    it('shows the change inside the real file instead of a separate diff', async () => {
        const waiting = service.proposeChange('/test/file.ts', 'proposed');
        await flush();

        expect(currentDocument.text).toBe('original\nproposed');
        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('vscode.diff', expect.anything(), expect.anything(), expect.anything(), expect.anything());
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        expect(service.hasPendingProposal).toBe(true);

        await service.accept();
        await expect(waiting).resolves.toBe(true);
        expect(currentDocument.text).toBe('proposed');
        expect(currentDocument.save).toHaveBeenCalled();
    });

    it('restores the original text when rejected', async () => {
        const waiting = service.proposeChange('/test/file.ts', 'proposed');
        await flush();

        await service.reject();

        await expect(waiting).resolves.toBe(false);
        expect(currentDocument.text).toBe('original');
        expect(service.hasPendingProposal).toBe(false);
    });

    it('accepts and rejects individual changes', async () => {
        currentDocument = makeDocument('a\nb\nc\nd\ne');
        const waiting = service.proposeChange('/test/file.ts', 'A\nb\nc\nd\nE');
        await flush();

        await service.decideHunk(0, 'accepted');
        expect(service.hasPendingProposal).toBe(true);
        await service.decideHunk(1, 'rejected');

        await expect(waiting).resolves.toBe(true);
        expect(currentDocument.text).toBe('A\nb\nc\nd\ne');
    });

    it('creates a new file for review and deletes it again on reject', async () => {
        (vscode.workspace.fs.stat as jest.Mock).mockRejectedValue(new Error('FileNotFound'));
        currentDocument = makeDocument('', '/test/new.ts');

        const waiting = service.proposeChange('/test/new.ts', 'console.log("hi");');
        await flush();
        expect(vscode.workspace.fs.writeFile).toHaveBeenCalledTimes(1);

        await service.reject();
        await expect(waiting).resolves.toBe(false);
        expect(vscode.workspace.fs.delete).toHaveBeenCalled();
    });

    it('does not overwrite edits the user made during the review', async () => {
        const waiting = service.proposeChange('/test/file.ts', 'proposed');
        await flush();
        currentDocument.text = 'typed by user';

        await service.accept();

        await expect(waiting).resolves.toBe(false);
        expect(currentDocument.text).toBe('typed by user');
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('The file changed while the proposal was open'));
    });

    it('skips the review when the file already has the proposed contents', async () => {
        currentDocument = makeDocument('same');
        await expect(service.proposeChange('/test/file.ts', 'same')).resolves.toBe(true);
        expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    });

    it('rejects a path outside the workspace', async () => {
        await expect(service.proposeChange('/outside/file.ts', 'x')).resolves.toBe(false);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Access denied: path is outside the workspace');
        expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
    });

    it('rejects an empty path', async () => {
        await expect(service.proposeChange('', 'x')).resolves.toBe(false);
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('A valid file path is required');
    });
});
