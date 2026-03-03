import * as vscode from 'vscode';
import { EnhancedDiffEngine } from './services/EnhancedDiffEngine';
import { ApprovalManager } from './services/ApprovalManager';
import { DiffApprovalView } from './ui/DiffApprovalView';

/**
 * Orchestrates the reasoned edit command.
 * 1. Takes user input instruction.
 * 2. Uses EnhancedDiffEngine to generate a reasoned proposal.
 * 3. Shows the DiffApprovalView for user review.
 */
export async function runEditCommand(
  diffEngine: EnhancedDiffEngine,
  approvalManager: ApprovalManager,
  diffApprovalView: DiffApprovalView
) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return vscode.window.showWarningMessage('Please open a file to edit.');
  }

  const instruction = await vscode.window.showInputBox({
    prompt: 'Describe the change (e.g., "add error handling to this function").',
    placeHolder: 'Your edit instruction...',
    ignoreFocusOut: true
  });

  if (!instruction || !instruction.trim()) {
    return;
  }

  const doc = editor.document;
  const fullText = doc.getText();
  const filePath = vscode.workspace.asRelativePath(doc.uri, false);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Orbit: Reasoning about changes...',
      cancellable: false
    },
    async () => {
      try {
        // Generate the proposal with reasoning and diff-hunks
        const proposal = await diffEngine.generateProposal(
          filePath,
          fullText,
          instruction.trim()
        );

        if (!proposal) {
          throw new Error('AI could not generate a valid proposal for this change.');
        }

        // Stage for approval
        approvalManager.setProposal(proposal);

        // Show the approval UI
        diffApprovalView.show(proposal);

      } catch (e: any) {
        vscode.window.showErrorMessage(`Edit failed: ${e?.message ?? e}`);
      }
    }
  );
}
