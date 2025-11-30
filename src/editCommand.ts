import * as vscode from 'vscode';
import { generate } from './ollamaClient';

// Store content for the diff view
const diffContentMap = new Map<string, string>();

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  static scheme = 'offline-diff';

  provideTextDocumentContent(uri: vscode.Uri): string {
    return diffContentMap.get(uri.toString()) || '';
  }
}

/**
 * Extract a unified diff from model output.
 * Supports plain unified diff or fenced blocks ```diff / ```patch.
 */
import { extractUnifiedDiff, applyUnifiedDiff } from './diffUtils';

/**
 * Build a strict prompt: ask ONLY for unified diff for the active file.
 */
function buildDiffPrompt(filePath: string, original: string, instruction: string): string {
  return [
    'You are a precise code editor. Apply the user instruction to the given file and output a standard UNIX unified diff (patch) for this single file.',
    'Rules:',
    '- Output ONLY the diff. No prose, no explanations.',
    `- Use headers with the exact file path:`,
    `  --- a/${filePath}`,
    `  +++ b/${filePath}`,
    '- Use hunk headers like: @@ -oldStart,oldLen +newStart,newLen @@',
    '- Include only the minimal necessary changes.',
    '',
    'User instruction:',
    instruction,
    '',
    'Original file content begins:',
    '```',
    original,
    '```',
    '',
    'Now output ONLY the unified diff.'
  ].join('\n');
}

export async function runEditCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return vscode.window.showWarningMessage('Open a file to edit.');

  const instruction = await vscode.window.showInputBox({
    prompt: 'Describe the change (e.g., “convert to async/await and add error handling”).',
    placeHolder: 'Your edit instruction…',
    ignoreFocusOut: true
  });
  if (!instruction?.trim()) return;

  const doc = editor.document;
  const fullText = doc.getText();
  const relPath = vscode.workspace.asRelativePath(doc.uri, false);

  const prompt = buildDiffPrompt(relPath, fullText, instruction.trim());

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Generating patch (local)…', cancellable: false },
    async () => {
      try {
        const resp = await generate(prompt);
        const diff = extractUnifiedDiff(resp);
        if (!diff) throw new Error('Model did not return a unified diff.');

        const newText = applyUnifiedDiff(fullText, diff);

        // Prepare the diff view
        const originalUri = doc.uri;
        // Create a URI for the "right" side of the diff
        const diffUri = vscode.Uri.parse(`${DiffContentProvider.scheme}:${originalUri.path}?t=${Date.now()}`);

        // Store the content
        diffContentMap.set(diffUri.toString(), newText);

        // Open diff
        await vscode.commands.executeCommand(
          'vscode.diff',
          originalUri,
          diffUri,
          `${relPath} ↔ AI Proposed`
        );

      } catch (e: any) {
        vscode.window.showErrorMessage(`Edit failed: ${e?.message ?? e}`);
      }
    }
  );
}
