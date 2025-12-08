import * as vscode from 'vscode';
import { CorrectionStatus, CorrectionSuggestion } from './types';
import { FindingCategory } from '../reviewTypes';

interface CorrectionPreferences {
    rejectedPatterns: RejectionPattern[];
    acceptedPatterns: AcceptancePattern[]; // Placeholder for now
}

interface RejectionPattern {
    pattern: string;
    category: FindingCategory;
    count: number;
}

interface AcceptancePattern {
    pattern: string;
}

export class CorrectionManager {
    private corrections: Map<string, CorrectionSuggestion> = new Map();
    private preferences: CorrectionPreferences = {
        rejectedPatterns: [],
        acceptedPatterns: []
    };

    private _onDidChangeCorrections = new vscode.EventEmitter<void>();
    public readonly onDidChangeCorrections = this._onDidChangeCorrections.event;

    constructor(private readonly context: vscode.ExtensionContext) {
        // Load preferences from global state
        const storedPrefs = context.globalState.get<CorrectionPreferences>('orbit.correctionPreferences');
        if (storedPrefs) {
            this.preferences = storedPrefs;
        }
    }

    public addCorrections(newCorrections: CorrectionSuggestion[]) {
        for (const correction of newCorrections) {
            // Check if matches rejected pattern
            if (this.matchesRejected(correction)) {
                continue;
            }
            this.corrections.set(correction.id, correction);
        }
        this._onDidChangeCorrections.fire();
    }

    public getCorrection(id: string): CorrectionSuggestion | undefined {
        return this.corrections.get(id);
    }

    public getCorrectionsForFile(fileUri: vscode.Uri): CorrectionSuggestion[] {
        const fileStr = fileUri.fsPath; // Using fsPath for simpler matching, might need normalization
        return Array.from(this.corrections.values()).filter(c =>
            c.location.fileName === fileStr || c.location.fileName === fileUri.toString() // lenient check
        );
    }

    public getAllCorrections(): CorrectionSuggestion[] {
        return Array.from(this.corrections.values());
    }

    public updateStatus(correctionId: string, status: CorrectionStatus) {
        const correction = this.corrections.get(correctionId);
        if (correction) {
            correction.status = status;

            if (status === CorrectionStatus.Rejected) {
                this.recordRejection(correction);
            }
            this._onDidChangeCorrections.fire();
        }
    }

    private recordRejection(correction: CorrectionSuggestion) {
        // Simple pattern recording: reject exact suggestion code if suggested again
        if (correction.suggestedFix) {
            this.preferences.rejectedPatterns.push({
                pattern: correction.suggestedFix.code.trim(),
                category: correction.category,
                count: 1
            });
            this.savePreferences();
        }
    }

    private matchesRejected(correction: CorrectionSuggestion): boolean {
        if (!correction.suggestedFix) return false;
        const code = correction.suggestedFix.code.trim();
        return this.preferences.rejectedPatterns.some(p => p.pattern === code);
    }

    private savePreferences() {
        this.context.globalState.update('orbit.correctionPreferences', this.preferences);
    }

    public clearCorrectionsForFile(fileUri: vscode.Uri) {
        const toRemove = this.getCorrectionsForFile(fileUri).map(c => c.id);
        toRemove.forEach(id => this.corrections.delete(id));
        this._onDidChangeCorrections.fire();
    }
}
