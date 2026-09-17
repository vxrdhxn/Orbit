import { DecisionJournal } from '../memory/DecisionJournal';
import { DiffProposal } from '../reasoning/types';
import { PartialDiffApplicator } from '../diffUtils';
import * as fs from 'fs';
import * as vscode from 'vscode';

/**
 * Manages the approval/rejection lifecycle of a DiffProposal.
 */
export class ApprovalManager {
    private currentProposal: DiffProposal | null = null;

    constructor(private decisionJournal: DecisionJournal) {}

    /**
     * Stores the current pending proposal.
     */
    setProposal(proposal: DiffProposal) {
        this.currentProposal = proposal;
    }

    /**
     * Gets the current pending proposal.
     */
    getProposal(): DiffProposal | null {
        return this.currentProposal;
    }

    /**
     * Gets the current workspace project ID.
     */
    private getProjectId(): string {
        return (
            vscode.workspace.workspaceFolders?.[0]?.name ??
            'workspace'
        );
    }

    /**
     * Applies the selected hunks (or all if none specified)
     * to the file and logs the decision.
     */
    async approve(selectedHunkIds?: string[]): Promise<boolean> {
        if (!this.currentProposal) {
            return false;
        }

        try {
            const projectId = this.getProjectId();

            const originalCode = fs.readFileSync(
                this.currentProposal.fileName,
                'utf8'
            );

            const newCode = PartialDiffApplicator.apply(
                originalCode,
                this.currentProposal.hunks,
                selectedHunkIds
            );

            fs.writeFileSync(
                this.currentProposal.fileName,
                newCode
            );

            // Log the approved decision to the journal.
            this.decisionJournal.saveDecision(
                projectId,
                this.currentProposal.fileName,
                'edit',
                this.currentProposal.reasoning,
                true
            );

            this.currentProposal = null;
            return true;
        } catch (e) {
            console.error(
                '[ApprovalManager] Failed to apply approved changes:',
                e
            );

            return false;
        }
    }

    /**
     * Rejects the current proposal and logs the rejection.
     */
    reject() {
        if (this.currentProposal) {
            const projectId = this.getProjectId();

            // Log the rejected decision for learning.
            this.decisionJournal.saveDecision(
                projectId,
                this.currentProposal.fileName,
                'edit',
                this.currentProposal.reasoning,
                false
            );
        }

        this.currentProposal = null;
    }
}