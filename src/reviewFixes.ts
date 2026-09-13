import { Finding } from './reviewTypes';
import * as vscode from 'vscode';

export class FixApplicator {
    /**
     * Applies a suggested review fix to the target file.
     *
     * The fix is applied only when the code at the finding's recorded
     * location still matches the original review snippet.
     */
    async applyFix(finding: Finding): Promise<boolean> {
        if (!finding.suggestedFix || !finding.location) {
            return false;
        }

        const { fileName, startLine, endLine, snippet } = finding.location;
        const proposedCode = finding.suggestedFix.code;

        if (!fileName || !proposedCode) {
            return false;
        }

        if (
            !Number.isInteger(startLine) ||
            !Number.isInteger(endLine) ||
            startLine < 1 ||
            endLine < startLine
        ) {
            return false;
        }

        try {
            const targetUri = vscode.Uri.file(fileName);

            const document = await vscode.workspace.openTextDocument(targetUri);

            const totalLines = document.lineCount;

            if (endLine > totalLines) {
                return false;
            }

            const startIndex = startLine - 1;
            const endIndex = endLine - 1;

            const actualSnippet = document
                .getText(
                    new vscode.Range(
                        startIndex,
                        0,
                        endIndex,
                        document.lineAt(endIndex).text.length
                    )
                )
                .trim();

            const expectedSnippet = snippet.trim();

            if (
                expectedSnippet &&
                actualSnippet !== expectedSnippet
            ) {
                return false;
            }

            const range = new vscode.Range(
                startIndex,
                0,
                endIndex,
                document.lineAt(endIndex).text.length
            );

            const edit = new vscode.WorkspaceEdit();

            edit.replace(targetUri, range, proposedCode);

            const applied = await vscode.workspace.applyEdit(edit);

            if (!applied) {
                return false;
            }

            await document.save();

            return true;
        } catch {
            return false;
        }
    }
}