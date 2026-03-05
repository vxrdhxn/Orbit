import * as vscode from 'vscode';
import { DecisionJournal } from '../memory/DecisionJournal';
import { DecisionHistoryView } from '../ui/DecisionHistoryView';

/**
 * Command handler to view the decision history.
 */
export function runViewDecisionHistory(
    decisionJournal: DecisionJournal,
    historyView: DecisionHistoryView
) {
    // For now, assume a single project ID or use a default
    // In a full implementation, this might be the workspace folder name/hash
    const projectId = vscode.workspace.name || 'default-project';

    const decisions = decisionJournal.getRecentDecisions(projectId, 50);
    historyView.show(decisions);
}
