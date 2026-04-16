import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * Manages the inline code apply lifecycle:
 *   1. proposeChange() — writes proposed content, opens diff editor, shows accept/reject
 *   2. accept() — keeps the proposed changes
 *   3. reject() — restores the original file content
 */
export class InlineApplyService {
    private _originalContent: string | null = null;
    private _targetUri: vscode.Uri | null = null;
    private _tempUri: vscode.Uri | null = null;
    private _pendingResolve: ((accepted: boolean) => void) | null = null;

    /**
     * Proposes a code change by opening VS Code's native diff editor.
     * @param targetFilePath - Absolute path to the file to modify
     * @param proposedContent - The full new content for the file
     * @returns true if accepted, false if rejected
     */
    async proposeChange(targetFilePath: string, proposedContent: string): Promise<boolean> {
        // Clean up any previous pending proposal
        this.cleanup();

        const targetUri = vscode.Uri.file(targetFilePath);

        // 1. Read and save the original content
        try {
            const originalBytes = await vscode.workspace.fs.readFile(targetUri);
            this._originalContent = Buffer.from(originalBytes).toString('utf8');
        } catch (e) {
            vscode.window.showErrorMessage(`Cannot read file: ${targetFilePath}`);
            return false;
        }

        this._targetUri = targetUri;

        // 2. Write the proposed content to a temp file for the diff view
        const tempDir = os.tmpdir();
        const ext = path.extname(targetFilePath);
        const baseName = path.basename(targetFilePath, ext);
        const tempPath = path.join(tempDir, `${baseName}.proposed${ext}`);
        fs.writeFileSync(tempPath, proposedContent, 'utf8');
        this._tempUri = vscode.Uri.file(tempPath);

        // 3. Open VS Code's native diff editor: left = original (temp), right = proposed (temp)
        //    We show original on left, proposed on right
        //    But to let the user "accept" by simply keeping the file, we write proposed to the REAL file
        //    and show original in the temp. This way:
        //    - Accept = close diff, changes are already in the file
        //    - Reject = we restore original content

        // Write original to temp (for diff left side)
        fs.writeFileSync(tempPath, this._originalContent, 'utf8');

        // Write proposed to the actual file
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(targetUri, encoder.encode(proposedContent));

        // 4. Open diff: temp (original) vs actual file (proposed)
        const fileName = path.basename(targetFilePath);
        await vscode.commands.executeCommand(
            'vscode.diff',
            this._tempUri,
            targetUri,
            `${fileName}: Original ↔ Proposed Changes`,
            { preview: true }
        );

        // 5. Show accept/reject notification
        return new Promise<boolean>((resolve) => {
            this._pendingResolve = resolve;

            vscode.window.showInformationMessage(
                `Orbit: Changes applied to ${fileName}. Review the diff.`,
                'Accept ✓',
                'Reject ✗'
            ).then(async (choice) => {
                if (choice === 'Accept ✓') {
                    await this.accept();
                    resolve(true);
                } else {
                    await this.reject();
                    resolve(false);
                }
                this._pendingResolve = null;
            });
        });
    }

    /**
     * Accepts the proposed changes — they are already written to the file.
     * Just clean up temp files and close the diff.
     */
    async accept(): Promise<void> {
        if (this._targetUri) {
            // Save the file to ensure changes persist
            const doc = vscode.workspace.textDocuments.find(
                d => d.uri.fsPath === this._targetUri!.fsPath
            );
            if (doc && doc.isDirty) {
                await doc.save();
            }
            vscode.window.showInformationMessage('Orbit: Changes accepted ✓');
        }
        this.cleanup();
    }

    /**
     * Rejects the proposed changes — restore the original content.
     */
    async reject(): Promise<void> {
        if (this._targetUri && this._originalContent !== null) {
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(
                this._targetUri,
                encoder.encode(this._originalContent)
            );
            // Also save to clear the dirty state
            const doc = vscode.workspace.textDocuments.find(
                d => d.uri.fsPath === this._targetUri!.fsPath
            );
            if (doc && doc.isDirty) {
                await doc.save();
            }
            vscode.window.showInformationMessage('Orbit: Changes rejected — file restored ✗');
        }
        this.cleanup();
    }

    /**
     * Checks if there's a pending proposal.
     */
    get hasPendingProposal(): boolean {
        return this._originalContent !== null && this._targetUri !== null;
    }

    /**
     * Clean up temp files and state.
     */
    private cleanup() {
        if (this._tempUri) {
            try { fs.unlinkSync(this._tempUri.fsPath); } catch { /* ignore */ }
        }
        this._originalContent = null;
        this._targetUri = null;
        this._tempUri = null;
    }
}
