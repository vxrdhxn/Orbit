import * as vscode from 'vscode';
import { CorrectionManager } from '../CorrectionManager';
import { CorrectionStatus } from '../types';

export class CorrectionCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor(private readonly correctionManager: CorrectionManager) {
        // Refresh lenses when corrections change
        correctionManager.onDidChangeCorrections(() => {
            this._onDidChangeCodeLenses.fire();
        });
    }

    provideCodeLenses(document: vscode.TextDocument): vscode.ProviderResult<vscode.CodeLens[]> {
        const corrections = this.correctionManager.getCorrectionsForFile(document.uri);
        const lenses: vscode.CodeLens[] = [];

        corrections.forEach(c => {
            if (c.status !== CorrectionStatus.Pending) {return;}

            const range = new vscode.Range(c.location.startLine - 1, 0, c.location.endLine - 1, Number.MAX_VALUE);

            // Command to apply
            const acceptCmd: vscode.Command = {
                title: '$(check) Accept Fix',
                command: 'orbit.applyCorrection',
                arguments: [c.id]
            };

            // Command to reject
            const rejectCmd: vscode.Command = {
                title: '$(x) Reject',
                command: 'orbit.rejectCorrection',
                arguments: [c.id]
            };

            lenses.push(new vscode.CodeLens(range, acceptCmd));
            lenses.push(new vscode.CodeLens(range, rejectCmd));
        });

        return lenses;
    }
}
