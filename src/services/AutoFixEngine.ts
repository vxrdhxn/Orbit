import * as vscode from 'vscode';
import { Finding } from '../reviewTypes';
import { DecisionJournal } from '../memory/DecisionJournal';

export class AutoFixEngine {
    private lastFix: { uri: vscode.Uri, edit: vscode.WorkspaceEdit, findingId: string } | undefined;

    constructor(
        private journal: DecisionJournal
    ) { }

    /**
     * Applies a suggested fix from a finding.
     */
    public async applyFix(document: vscode.TextDocument, finding: Finding): Promise<boolean> {
        if (!finding.suggestedFix || !finding.suggestedFix.code) {
            return false;
        }

        const edit = new vscode.WorkspaceEdit();
        const range = new vscode.Range(
            Math.max(0, finding.location.startLine - 1),
            0,
            Math.max(0, finding.location.endLine - 1),
            100 // This is a bit coarse, ideally we'd know the exact line length
        );

        // For a more precise replacement, we should get the actual line text
        // but for now, we'll replace the whole range defined by the finding
        edit.replace(document.uri, range, finding.suggestedFix.code);

        const success = await vscode.workspace.applyEdit(edit);

        if (success) {
            this.lastFix = { uri: document.uri, edit, findingId: finding.id };
            this.logFix(document.uri.fsPath, finding);
            this.showUndoNotification();
        }

        return success;
    }

    /**
     * Undoes the last applied fix.
     */
    public async undoLastFix(): Promise<boolean> {
        if (!this.lastFix) {
            vscode.window.showInformationMessage('No recent Orbit fix to undo.');
            return false;
        }

        // WorkspaceEdit doesn't have a built-in "inverse", so we rely on VS Code's undo stack
        // OR we'd have to store the original text. 
        // For simplicity and to integrate with VS Code's native undo:
        await vscode.commands.executeCommand('undo');

        vscode.window.showInformationMessage(`Undone Orbit fix for "${this.lastFix.findingId}"`);
        this.lastFix = undefined;
        return true;
    }

    private logFix(filePath: string, finding: Finding) {
        const projectId = vscode.workspace.name || 'default';
        this.journal.recordManualDecision({
            id: `fix-${Date.now()}`,
            project_id: projectId,
            file_path: filePath,
            change_type: `Auto-fix: ${finding.title}`,
            what: JSON.stringify([finding.description]),
            why: 'Applied suggested AI fix for improved code quality.',
            approved: true
        });
    }

    private showUndoNotification() {
        const undoAction = 'Undo Fix';
        vscode.window.showInformationMessage('Orbit applied an automated fix.', undoAction)
            .then(selection => {
                if (selection === undoAction) {
                    this.undoLastFix();
                }
            });
    }
}
