import * as vscode from 'vscode';
import * as path from 'path';
import { resolveWorkspacePath } from '../utils/workspacePath';
import { Segment, computeSegments, changeSegments, render, allDecided, splitLines, RenderResult } from './inlineDiff';

/**
 * Reviews a proposed change directly inside the real file, like an inline
 * code-editor suggestion:
 *
 *  - removed lines are shown with a red background, added lines in green;
 *  - each change has "Accept" / "Reject" buttons (CodeLens) right above it,
 *    plus "Accept All" (Ctrl+Enter) and "Reject All" (Ctrl+Backspace);
 *  - when every change is decided, the file is saved with the result.
 *
 * Until the review ends, the extra lines only live in the editor buffer.
 * Rejecting everything restores the original text.
 */
export class InlineApplyService implements vscode.CodeLensProvider {
    private _segments: Segment[] = [];
    private _document: vscode.TextDocument | null = null;
    private _wasDirty = false;
    private _createdFile = false;
    private _eol = '\n';
    /** Text Orbit last put in the buffer; anything else means the user edited it. */
    private _renderedText: string | null = null;
    private _rendered: RenderResult | null = null;
    private _pendingResolve: ((accepted: boolean) => void) | null = null;

    private _addedDecoration: vscode.TextEditorDecorationType | null = null;
    private _removedDecoration: vscode.TextEditorDecorationType | null = null;
    private readonly _codeLensChanged = typeof (vscode as any).EventEmitter === 'function'
        ? new vscode.EventEmitter<void>()
        : null;
    public readonly onDidChangeCodeLenses = this._codeLensChanged?.event;

    /** Registers the editor buttons, commands and keybinding context. Call once on activation. */
    register(context: vscode.ExtensionContext): void {
        if (!vscode.languages?.registerCodeLensProvider || !vscode.commands?.registerCommand) {
            return;
        }

        this._addedDecoration = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
            overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.addedForeground'),
            overviewRulerLane: vscode.OverviewRulerLane.Left,
        });
        this._removedDecoration = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
            overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.deletedForeground'),
            overviewRulerLane: vscode.OverviewRulerLane.Left,
            opacity: '0.75',
        });

        const subscriptions = [
            this._addedDecoration,
            this._removedDecoration,
            vscode.languages.registerCodeLensProvider({ scheme: 'file' }, this),
            vscode.commands.registerCommand('orbit.inlineChange.acceptAll', () => this.decideAll('accepted')),
            vscode.commands.registerCommand('orbit.inlineChange.rejectAll', () => this.decideAll('rejected')),
            vscode.commands.registerCommand('orbit.inlineChange.acceptHunk', (i: number) => this.decideHunk(i, 'accepted')),
            vscode.commands.registerCommand('orbit.inlineChange.rejectHunk', (i: number) => this.decideHunk(i, 'rejected')),
            // Re-apply highlights when the file is shown again (e.g. after switching tabs).
            vscode.window.onDidChangeVisibleTextEditors(() => this.decorate()),
            vscode.workspace.onDidCloseTextDocument(doc => {
                if (doc === this._document) {
                    this.finish(false);
                }
            }),
        ];
        if (this._codeLensChanged) {
            subscriptions.push(this._codeLensChanged);
        }
        context.subscriptions?.push(...subscriptions);
    }

    get hasPendingProposal(): boolean {
        return this._document !== null;
    }

    /**
     * Shows the change inline in the target file and waits for the user.
     * @returns true if the user accepted at least one change.
     */
    async proposeChange(targetFilePath: string, proposedContent: string): Promise<boolean> {
        let fullPath: string;
        try {
            fullPath = await resolveWorkspacePath(targetFilePath);
        } catch (e: any) {
            vscode.window.showErrorMessage(e.message);
            return false;
        }

        // Only one review at a time: the previous one counts as rejected.
        if (this.hasPendingProposal) {
            await this.reject();
        }

        const uri = vscode.Uri.file(fullPath);
        let document: vscode.TextDocument;
        let createdFile = false;
        try {
            if (!(await this.exists(uri))) {
                // A new file: create it empty so it can be reviewed like any other.
                await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(fullPath)));
                await vscode.workspace.fs.writeFile(uri, new Uint8Array());
                createdFile = true;
            }
            document = await vscode.workspace.openTextDocument(uri);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Orbit: Cannot open ${path.basename(fullPath)}: ${e.message}`);
            return false;
        }

        const original = document.getText();
        const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
        let proposed = splitLines(proposedContent).join(eol);
        // Keep the file's trailing newline convention.
        if (original.endsWith(eol) && !proposed.endsWith(eol)) {
            proposed += eol;
        }

        if (original === proposed) {
            vscode.window.showInformationMessage(`Orbit: ${path.basename(fullPath)} already has these contents.`);
            return true;
        }

        this._document = document;
        this._wasDirty = document.isDirty;
        this._createdFile = createdFile;
        this._eol = eol;
        this._segments = computeSegments(original, proposed);

        const editor = await vscode.window.showTextDocument(document, { preview: false });
        await this.renderToBuffer();

        const firstHunk = this._rendered?.hunks[0];
        if (firstHunk) {
            const position = new vscode.Position(firstHunk.startLine, 0);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        }
        await vscode.commands.executeCommand('setContext', 'orbit.inlineChangePending', true);

        return new Promise<boolean>(resolve => {
            this._pendingResolve = resolve;
        });
    }

    async accept(): Promise<void> {
        await this.decideAll('accepted');
    }

    async reject(): Promise<void> {
        await this.decideAll('rejected');
    }

    async decideAll(decision: 'accepted' | 'rejected'): Promise<void> {
        if (!this.hasPendingProposal) {
            return;
        }
        for (const segment of changeSegments(this._segments)) {
            if (segment.decision === 'pending') {
                segment.decision = decision;
            }
        }
        await this.update();
    }

    async decideHunk(index: number, decision: 'accepted' | 'rejected'): Promise<void> {
        const segment = changeSegments(this._segments)[index];
        if (!segment || segment.decision !== 'pending') {
            return;
        }
        segment.decision = decision;
        await this.update();
    }

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (document !== this._document || !this._rendered) {
            return [];
        }
        const pending = this._rendered.hunks.filter(h => h.decision === 'pending');
        const lenses: vscode.CodeLens[] = [];

        pending.forEach((hunk, i) => {
            const line = Math.min(hunk.startLine, Math.max(document.lineCount - 1, 0));
            const range = new vscode.Range(line, 0, line, 0);
            if (i === 0 && pending.length > 1) {
                lenses.push(
                    new vscode.CodeLens(range, { title: '✓ Accept All (Ctrl+Enter)', command: 'orbit.inlineChange.acceptAll' }),
                    new vscode.CodeLens(range, { title: '✕ Reject All (Ctrl+Backspace)', command: 'orbit.inlineChange.rejectAll' }),
                );
            }
            const shortcut = pending.length === 1 ? ' (Ctrl+Enter)' : '';
            const rejectShortcut = pending.length === 1 ? ' (Ctrl+Backspace)' : '';
            lenses.push(
                new vscode.CodeLens(range, { title: `✓ Accept${shortcut}`, command: 'orbit.inlineChange.acceptHunk', arguments: [hunk.index] }),
                new vscode.CodeLens(range, { title: `✕ Reject${rejectShortcut}`, command: 'orbit.inlineChange.rejectHunk', arguments: [hunk.index] }),
            );
        });
        return lenses;
    }

    /** Re-renders after a decision, or finishes once every change is decided. */
    private async update(): Promise<void> {
        const document = this._document;
        if (!document) {
            return;
        }

        // The user typed in the file during the review: do not overwrite their edits.
        if (this._renderedText !== null && document.getText() !== this._renderedText) {
            vscode.window.showErrorMessage(
                'Orbit: The file changed while the proposal was open. The proposed changes were not applied.'
            );
            this.finish(false);
            return;
        }

        if (!allDecided(this._segments)) {
            await this.renderToBuffer();
            return;
        }

        const accepted = changeSegments(this._segments).some(s => s.decision === 'accepted');
        try {
            await this.renderToBuffer();
            this.clearDecorations();
            if (!accepted && this._createdFile) {
                // The new file was never wanted: remove it again.
                await vscode.workspace.fs.delete(document.uri);
            } else if (accepted || !this._wasDirty) {
                await document.save();
            }
        } catch (e: any) {
            vscode.window.showErrorMessage(`Orbit: Could not finish the change: ${e.message}`);
        }
        this.finish(accepted);
    }

    private async renderToBuffer(): Promise<void> {
        const document = this._document;
        if (!document) {
            return;
        }
        this._rendered = render(this._segments);
        const text = this._rendered.lines.join(this._eol);

        if (document.getText() !== text) {
            const edit = new vscode.WorkspaceEdit();
            edit.replace(
                document.uri,
                new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
                text
            );
            await vscode.workspace.applyEdit(edit);
        }
        this._renderedText = document.getText();
        this.decorate();
        this._codeLensChanged?.fire();
    }

    private decorate(): void {
        if (!this._document || !this._rendered || !this._addedDecoration || !this._removedDecoration) {
            return;
        }
        const toRanges = (lines: number[]) => lines.map(l => new vscode.Range(l, 0, l, 0));
        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document === this._document) {
                editor.setDecorations(this._addedDecoration, toRanges(this._rendered.addedLines));
                editor.setDecorations(this._removedDecoration, toRanges(this._rendered.removedLines));
            }
        }
    }

    private clearDecorations(): void {
        if (!this._addedDecoration || !this._removedDecoration) {
            return;
        }
        for (const editor of vscode.window.visibleTextEditors ?? []) {
            editor.setDecorations(this._addedDecoration, []);
            editor.setDecorations(this._removedDecoration, []);
        }
    }

    private finish(accepted: boolean): void {
        this.clearDecorations();
        const resolve = this._pendingResolve;
        this._pendingResolve = null;
        this._document = null;
        this._renderedText = null;
        this._rendered = null;
        this._segments = [];
        this._createdFile = false;
        this._codeLensChanged?.fire();
        Promise.resolve(vscode.commands.executeCommand('setContext', 'orbit.inlineChangePending', false)).catch(() => undefined);
        resolve?.(accepted);
    }

    private async exists(uri: vscode.Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }
}
