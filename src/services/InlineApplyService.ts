import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * Manages the inline code apply lifecycle:
 *
 *  1. proposeChange() — creates temporary original/proposed files and opens diff
 *  2. accept() — applies the proposed content to the real file
 *  3. reject() — discards the proposal without modifying the real file
 *
 * The target file is NEVER modified during proposeChange().
 */
export class InlineApplyService {
    private _originalContent: string | null = null;
    private _proposedContent: string | null = null;
    private _targetUri: vscode.Uri | null = null;
    private _originalTempUri: vscode.Uri | null = null;
    private _proposedTempUri: vscode.Uri | null = null;
    private _pendingResolve: ((accepted: boolean) => void) | null = null;

    /**
     * Proposes a code change by opening VS Code's native diff editor.
     *
     * The real target file is not modified until the user explicitly accepts.
     *
     * @param targetFilePath - Absolute path to the file to modify
     * @param proposedContent - The full new content for the file
     * @returns true if accepted, false if rejected or failed
     */
    async proposeChange(
        targetFilePath: string,
        proposedContent: string
    ): Promise<boolean> {
        // Resolve any previous pending proposal as rejected before cleanup.
        if (this._pendingResolve) {
            this._pendingResolve(false);
            this._pendingResolve = null;
        }

        this.cleanup();

        const targetUri = vscode.Uri.file(targetFilePath);

        // 1. Read and save the current original content.
        try {
            const openDocument = vscode.workspace.textDocuments.find(
                document => document.uri.fsPath === targetUri.fsPath
            );

            if (openDocument) {
                this._originalContent = openDocument.getText();
            } else {
                const originalBytes =
                    await vscode.workspace.fs.readFile(targetUri);
                this._originalContent =
                    Buffer.from(originalBytes).toString('utf8');
            }
        } catch (e) {
            vscode.window.showErrorMessage(
                `Cannot read file: ${targetFilePath}`
            );
            return false;
        }

        this._targetUri = targetUri;
        this._proposedContent = proposedContent;

        // 2. Create unique temporary files for the diff.
        const tempDir = os.tmpdir();
        const ext = path.extname(targetFilePath);
        const baseName = path.basename(targetFilePath, ext);
        const uniqueId = `${Date.now()}-${process.pid}`;

        const originalTempPath = path.join(
            tempDir,
            `${baseName}.original.${uniqueId}${ext}`
        );

        const proposedTempPath = path.join(
            tempDir,
            `${baseName}.proposed.${uniqueId}${ext}`
        );

        try {
            fs.writeFileSync(
                originalTempPath,
                this._originalContent,
                'utf8'
            );

            fs.writeFileSync(
                proposedTempPath,
                proposedContent,
                'utf8'
            );

            this._originalTempUri = vscode.Uri.file(originalTempPath);
            this._proposedTempUri = vscode.Uri.file(proposedTempPath);
        } catch (e: any) {
            this.cleanup();
            vscode.window.showErrorMessage(
                `Cannot prepare change preview: ${e.message}`
            );
            return false;
        }

        // 3. Open diff: original on the left, proposed on the right.
        try {
            const fileName = path.basename(targetFilePath);

            await vscode.commands.executeCommand(
                'vscode.diff',
                this._originalTempUri,
                this._proposedTempUri,
                `${fileName}: Original ↔ Proposed Changes`,
                { preview: true }
            );
        } catch (e: any) {
            this.cleanup();
            vscode.window.showErrorMessage(
                `Cannot open change preview: ${e.message}`
            );
            return false;
        }

        // 4. Ask the user for explicit approval.
        return new Promise<boolean>((resolve) => {
            this._pendingResolve = resolve;

            vscode.window.showInformationMessage(
                `Orbit: Review proposed changes for ${path.basename(targetFilePath)}.`,
                'Accept ✓',
                'Reject ✕'
            ).then(async (choice) => {
                this._pendingResolve = null;

                if (choice === 'Accept ✓') {
                    try {
                        await this.accept();
                        resolve(true);
                    } catch (e: any) {
                        vscode.window.showErrorMessage(
                            `Orbit: Could not apply changes: ${e.message}`
                        );
                        resolve(false);
                    }
                } else {
                    await this.reject();
                    resolve(false);
                }
            });
        });
    }

    /**
     * Accepts the proposed changes.
     *
     * Before writing, verifies that the target file has not changed since
     * the proposal was created. This prevents Orbit from overwriting
     * unrelated user edits.
     */
    async accept(): Promise<void> {
        if (
            !this._targetUri ||
            this._originalContent === null ||
            this._proposedContent === null
        ) {
            return;
        }

        const targetUri = this._targetUri;

        const currentDocument = vscode.workspace.textDocuments.find(
            document => document.uri.fsPath === targetUri.fsPath
        );

        const currentContent = currentDocument
            ? currentDocument.getText()
            : Buffer.from(
                await vscode.workspace.fs.readFile(targetUri)
            ).toString('utf8');

        // Never overwrite changes made after the proposal was created.
        if (currentContent !== this._originalContent) {
            this.cleanup();

            throw new Error(
                'The file changed while the proposal was open. ' +
                'The proposed changes were not applied.'
            );
        }

        if (currentDocument) {
            const editor = await vscode.window.showTextDocument(
                currentDocument,
                { preview: false }
            );

            const fullRange = new vscode.Range(
                currentDocument.positionAt(0),
                currentDocument.positionAt(currentDocument.getText().length)
            );

            const applied = await editor.edit(editBuilder => {
                editBuilder.replace(fullRange, this._proposedContent!);
            });

            if (!applied) {
                throw new Error('VS Code rejected the proposed edit.');
            }

            await currentDocument.save();
        } else {
            const encoder = new TextEncoder();

            await vscode.workspace.fs.writeFile(
                targetUri,
                encoder.encode(this._proposedContent)
            );
        }

        vscode.window.showInformationMessage(
            `Orbit: Changes accepted ✓`
        );

        this.cleanup();
    }

    /**
     * Rejects the proposed changes.
     *
     * Since proposeChange() never modifies the real file, rejection simply
     * discards the temporary preview files.
     */
    async reject(): Promise<void> {
        this.cleanup();

        vscode.window.showInformationMessage(
            'Orbit: Changes rejected — file unchanged ✕'
        );
    }

    /**
     * Checks if there's a pending proposal.
     */
    get hasPendingProposal(): boolean {
        return (
            this._originalContent !== null &&
            this._proposedContent !== null &&
            this._targetUri !== null
        );
    }

    /**
     * Clean up temporary files and pending state.
     */
    private cleanup(): void {
        if (this._originalTempUri) {
            try {
                fs.unlinkSync(this._originalTempUri.fsPath);
            } catch {
                // Ignore cleanup failures.
            }
        }

        if (this._proposedTempUri) {
            try {
                fs.unlinkSync(this._proposedTempUri.fsPath);
            } catch {
                // Ignore cleanup failures.
            }
        }

        this._originalContent = null;
        this._proposedContent = null;
        this._targetUri = null;
        this._originalTempUri = null;
        this._proposedTempUri = null;
    }
}