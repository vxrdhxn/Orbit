import * as vscode from 'vscode';
import { SimpleIndex, cosine, IndexEntry } from './store';
import { embedOne } from './embeddings';
import * as path from 'path';

export async function performSearch(query: string, workspaceFolder: vscode.Uri): Promise<Array<{ entry: IndexEntry, score: number }>> {
  const index = new SimpleIndex(workspaceFolder);
  await index.load();
  const entries = index.getEntries();
  if (!entries.length) return [];

  const c = vscode.workspace.getConfiguration('offlineDevAssistant');
  const topK = c.get<number>('searchTopK', 5);

  const qvec = await embedOne(query);
  return entries.map(e => ({ entry: e, score: cosine(qvec, e.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function runSearch(context: vscode.ExtensionContext) {
  const query = await vscode.window.showInputBox({ prompt: 'Search code (semantic)', placeHolder: 'e.g., parse JSON error handling' });
  if (!query?.trim()) return;

  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) return vscode.window.showWarningMessage('Open a workspace folder first.');
  const workspaceFolder = ws.uri;

  const results = await performSearch(query, workspaceFolder);

  // Render a simple Markdown result doc with links
  const lines: string[] = [];
  lines.push(`# Search: ${query}`);
  lines.push('');
  if (!results.length) {
    lines.push('_No matches found._');
  } else {
    for (const { entry, score } of results) {
      const filePath = path.join(workspaceFolder.fsPath, entry.file);
      // Use fragment for offset if needed, or just open file
      const uri = vscode.Uri.file(filePath).with({ fragment: `${entry.start}` });
      lines.push(`### ${entry.file}  \`score: ${score.toFixed(3)}\``);
      lines.push(`[Open selection](${uri.toString()})`);
      lines.push('');
      lines.push('```');
      lines.push(entry.text.trim().slice(0, 800));
      lines.push('```');
      lines.push('');
    }
  }

  const doc = await vscode.workspace.openTextDocument({ content: lines.join('\n'), language: 'markdown' });
  await vscode.window.showTextDocument(doc, { preview: false });
}
