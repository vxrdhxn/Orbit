import * as path from 'path';
import { Finding, FileEdit } from './reviewTypes';
import * as vscode from 'vscode';

interface ValidatedEdit {
    uri: vscode.Uri;
    document: vscode.TextDocument;
    range: vscode.Range;
    code: string;
}

export class FixApplicator {
    /**
     * Applies a suggested review fix safely.
     *
     * All edits are validated before any changes are applied.
     * This prevents partial application of invalid multi-file fixes.
     */
    async applyFix(finding: Finding): Promise<boolean> {
        if (!finding.suggestedFix || !finding.location) {
            return false;
        }

        const workspaceFolder =
            vscode.workspace.workspaceFolders?.[0];

        if (!workspaceFolder) {
            return false;
        }

        const workspaceRoot = path.resolve(
            workspaceFolder.uri.fsPath
        );

        const mainEdit = await this.validateEdit(
            {
                fileName: finding.location.fileName,
                startLine: finding.location.startLine,
                endLine: finding.location.endLine,
                code: finding.suggestedFix.code
            },
            finding.location.snippet,
            workspaceRoot
        );

        if (!mainEdit) {
            return false;
        }

        const additionalEdits =
            finding.suggestedFix.additionalEdits || [];

        const validatedAdditionalEdits: ValidatedEdit[] = [];

        for (const additionalEdit of additionalEdits) {
            const validatedEdit = await this.validateEdit(
                additionalEdit,
                undefined,
                workspaceRoot
            );

            if (!validatedEdit) {
                return false;
            }

            validatedAdditionalEdits.push(validatedEdit);
        }

        const allEdits = [
            mainEdit,
            ...validatedAdditionalEdits
        ];

        /*
         * Prevent multiple replacements of the same file from
         * overlapping or being ambiguous.
         */
        if (!this.hasConflictingEdits(allEdits)) {
            return false;
        }

        const workspaceEdit = new vscode.WorkspaceEdit();

        for (const edit of allEdits) {
            workspaceEdit.replace(
                edit.uri,
                edit.range,
                edit.code
            );
        }

        try {
            const applied =
                await vscode.workspace.applyEdit(workspaceEdit);

            if (!applied) {
                return false;
            }

            const documents = this.getUniqueDocuments(allEdits);

            for (const document of documents) {
                const saved = await document.save();

                if (!saved) {
                    return false;
                }
            }

            return true;
        } catch {
            return false;
        }
    }

    private async validateEdit(
        edit: FileEdit,
        expectedSnippet: string | undefined,
        workspaceRoot: string
    ): Promise<ValidatedEdit | null> {
        if (
            !edit.fileName ||
            typeof edit.code !== 'string' ||
            edit.code.length === 0
        ) {
            return null;
        }

        if (
            !Number.isInteger(edit.startLine) ||
            !Number.isInteger(edit.endLine) ||
            edit.startLine < 1 ||
            edit.endLine < edit.startLine
        ) {
            return null;
        }

        const targetPath = path.isAbsolute(edit.fileName)
            ? path.normalize(edit.fileName)
            : path.resolve(workspaceRoot, edit.fileName);

        const normalizedTarget = path.resolve(targetPath);

        if (
            !this.isPathInsideWorkspace(
                workspaceRoot,
                normalizedTarget
            )
        ) {
            return null;
        }

        const targetUri = vscode.Uri.file(normalizedTarget);

        try {
            const document =
                await vscode.workspace.openTextDocument(targetUri);

            if (edit.endLine > document.lineCount) {
                return null;
            }

            const startIndex = edit.startLine - 1;
            const endIndex = edit.endLine - 1;

            const endLineText =
                document.lineAt(endIndex).text;

            const range = new vscode.Range(
                startIndex,
                0,
                endIndex,
                endLineText.length
            );

            if (
                expectedSnippet &&
                !this.matchesSnippet(
                    document,
                    range,
                    expectedSnippet
                )
            ) {
                return null;
            }

            return {
                uri: targetUri,
                document,
                range,
                code: edit.code
            };
        } catch {
            return null;
        }
    }

    private isPathInsideWorkspace(
        workspaceRoot: string,
        targetPath: string
    ): boolean {
        const relativePath = path.relative(
            workspaceRoot,
            targetPath
        );

        return !(
            relativePath === '..' ||
            relativePath.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relativePath)
        );
    }

    private matchesSnippet(
        document: vscode.TextDocument,
        range: vscode.Range,
        expectedSnippet: string
    ): boolean {
        const actualSnippet = document
            .getText(range)
            .trim();

        return actualSnippet === expectedSnippet.trim();
    }

    private hasConflictingEdits(
        edits: ValidatedEdit[]
    ): boolean {
        for (let index = 0; index < edits.length; index++) {
            for (
                let nextIndex = index + 1;
                nextIndex < edits.length;
                nextIndex++
            ) {
                const current = edits[index];
                const next = edits[nextIndex];

                if (
                    current.uri.fsPath !== next.uri.fsPath
                ) {
                    continue;
                }

                if (
                    this.rangesOverlap(
                        current.range,
                        next.range
                    )
                ) {
                    return false;
                }
            }
        }

        return true;
    }

    private rangesOverlap(
        first: vscode.Range,
        second: vscode.Range
    ): boolean {
        const firstEndsBeforeSecondStarts =
            first.end.line < second.start.line ||
            (
                first.end.line === second.start.line &&
                first.end.character <= second.start.character
            );

        const secondEndsBeforeFirstStarts =
            second.end.line < first.start.line ||
            (
                second.end.line === first.start.line &&
                second.end.character <= first.start.character
            );

        return !(
            firstEndsBeforeSecondStarts ||
            secondEndsBeforeFirstStarts
        );
    }

    private getUniqueDocuments(
        edits: ValidatedEdit[]
    ): vscode.TextDocument[] {
        const documents: vscode.TextDocument[] = [];

        for (const edit of edits) {
            const alreadyIncluded = documents.some(
                document =>
                    document.uri.fsPath ===
                    edit.document.uri.fsPath
            );

            if (!alreadyIncluded) {
                documents.push(edit.document);
            }
        }

        return documents;
    }
}
