import * as vscode from 'vscode';
import { CorrectionSuggestion, CorrectionStatus } from './types';
import { CorrectionManager } from './CorrectionManager';

export class FixApplicator {
    constructor(private readonly correctionManager: CorrectionManager) { }

    async applyCorrection(correctionId: string): Promise<boolean> {
        // 1. Get correction
        // We probably need a way to get a correction by ID from manager globally or passed in.
        // Manager has `corrections` map but it's private. 
        // We should add `getCorrection(id)` to Manager or FixApplicator should work on Correction objects.
        // Let's assume we fetch it via Manager for now (need to expose it).

        const correction = this.correctionManager.getCorrection(correctionId);
        if (!correction || !correction.suggestedFix) {return false;}

        const { location, suggestedFix } = correction;
        const uri = vscode.Uri.file(location.fileName);

        // 2. Prepare edit
        const edit = new vscode.WorkspaceEdit();
        const mainRange = new vscode.Range(
            location.startLine - 1, 0,
            location.endLine - 1, Number.MAX_VALUE
        );

        edit.replace(uri, mainRange, suggestedFix.code);

        // Append additional multi-file edits
        if (suggestedFix.additionalEdits && suggestedFix.additionalEdits.length > 0) {
            for (const additionalEdit of suggestedFix.additionalEdits) {
                const additionalUri = vscode.Uri.file(additionalEdit.fileName);
                const additionalRange = new vscode.Range(
                    additionalEdit.startLine - 1, 0,
                    additionalEdit.endLine - 1, Number.MAX_VALUE
                );
                edit.replace(additionalUri, additionalRange, additionalEdit.code);
            }
        }

        // 3. Apply edit
        try {
            const success = await vscode.workspace.applyEdit(edit);
            if (success) {
                this.correctionManager.updateStatus(correctionId, CorrectionStatus.Applied);
                // Also optionally format the document range
                const doc = await vscode.workspace.openTextDocument(uri);
                // Simple formatting if needed, but user might have format on save
            }
            return success;
        } catch (error) {
            console.error('Failed to apply correction:', error);
            return false;
        }
    }

    async rejectCorrection(correctionId: string) {
        this.correctionManager.updateStatus(correctionId, CorrectionStatus.Rejected);
    }
}
