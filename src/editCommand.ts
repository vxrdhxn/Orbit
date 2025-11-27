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
function extractUnifiedDiff(text: string): string | null {
  // Try fenced blocks first
  const fence = text.match(/```(?:diff|patch)\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();

  // Else, find first '--- ' then include until end (or until next unrelated prose)
  const start = text.indexOf('--- ');
  if (start >= 0) {
    return text.slice(start).trim();
  }
  return null;
}

/**
 * Apply a single-file unified diff to original content.
 * Minimal implementation: handles @@ hunks with context/+/− lines.
 */
function applyUnifiedDiff(original: string, diff: string): string {
  // Normalize line endings to \n
  const origLines = original.replace(/\r\n/g, '\n').split('\n');

  const lines = diff.replace(/\r\n/g, '\n').split('\n');

  // Skip headers (diff --git, index, ---/+++)
  let i = 0;
  while (i < lines.length && !lines[i].startsWith('@@')) i++;
  if (i >= lines.length) {
    // maybe headers come later; try to find first hunk header
    const j = lines.findIndex(l => l.startsWith('@@'));
    if (j === -1) throw new Error('No hunk header (@@) found in diff.');
    i = j;
  }

  let out: string[] = [];
  let origPos = 1; // 1-based line numbers

  function appendOrigUntil(target1Based: number) {
    // copy original lines from current position up to target-1
    while (origPos < target1Based && origPos - 1 < origLines.length) {
      out.push(origLines[origPos - 1]);
      origPos++;
    }
  }

  while (i < lines.length) {
    if (!lines[i].startsWith('@@')) {
      // skip stray lines until a hunk starts
      i++;
      continue;
    }

    // Parse hunk header: @@ -a,b +c,d @@ optional text
    const m = lines[i].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (!m) throw new Error(`Bad hunk header: ${lines[i]}`);
    const oldStart = parseInt(m[1], 10);
    // const oldLen = m[2] ? parseInt(m[2], 10) : 1;
    // const newStart = parseInt(m[3], 10);
    // const newLen = m[4] ? parseInt(m[4], 10) : 1;

    i++;

    // Copy unchanged lines up to the hunk start
    appendOrigUntil(oldStart);

    // Now process hunk lines until next '@@' or EOF
    while (i < lines.length && !lines[i].startsWith('@@')) {
      const line = lines[i];
      if (line.startsWith(' ')) {
        // context: copy one line from original
        if (origPos - 1 >= origLines.length) {
          // context beyond EOF — tolerate by treating as empty
          out.push(line.slice(1));
        } else {
          out.push(origLines[origPos - 1]);
        }
        origPos++;
      } else if (line.startsWith('-')) {
        // removal: advance original, don't add to out
        origPos++;
      } else if (line.startsWith('+')) {
        // addition: add to out, don't advance original
        out.push(line.slice(1));
      } else if (line.startsWith('\\')) {
        // "\ No newline at end of file" — ignore
      } else if (line.trim() === '') {
        // blank line in diff context — treat as context?
        out.push('');
      } else {
        // Unknown marker (safety): treat as context
        out.push(line);
        origPos++;
      }
      i++;
      if (i >= lines.length) break;
    }
  }

  // Append remaining original lines
  while (origPos - 1 < origLines.length) {
    out.push(origLines[origPos - 1]);
    origPos++;
  }

  return out.join('\n');
}

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
