import * as vscode from 'vscode';
import { embedTexts } from './embeddings';
import { SimpleIndex, IndexEntry, relativePath } from './store';

function cfg() {
  const c = vscode.workspace.getConfiguration('offlineDevAssistant');
  return {
    include: c.get<string[]>('indexIncludeGlobs', ['**/*.{ts,tsx,js,jsx,py,java,go,rs,cpp,c,cs,md}']),
    exclude: c.get<string[]>('indexExcludeGlobs', ['**/node_modules/**','**/.git/**','**/out/**','**/dist/**','**/.devmind/**']),
    maxChars: c.get<number>('indexMaxCharsPerChunk', 1200),
    overlap: c.get<number>('indexOverlapChars', 200),
  };
}

// simple chunker: greedy by characters, trying to break on blank lines where possible
function chunk(text: string, maxChars: number, overlap: number): { start: number; end: number; text: string }[] {
  const chunks: { start: number; end: number; text: string }[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + maxChars, text.length);
    // try to end on a blank line boundary within the last 150 chars
    const windowStart = Math.max(i, end - 150);
    const slice = text.slice(windowStart, end);
    const rel = slice.lastIndexOf('\n\n');
    if (rel > -1) end = windowStart + rel + 2;

    const t = text.slice(i, end);
    chunks.push({ start: i, end, text: t });
    if (end >= text.length) break;
    i = Math.max(end - overlap, 0);
  }
  return chunks;
}

export async function buildIndex(workspaceFolder: vscode.Uri, token?: vscode.CancellationToken) {
  const { include, exclude, maxChars, overlap } = cfg();
  const index = new SimpleIndex(workspaceFolder);
  await index.load();
  index.clear();

  const files = await vscode.workspace.findFiles(
    `{${include.join(',')}}`,
    `{${exclude.join(',')}}`
  );

  const entries: IndexEntry[] = [];
  for (const file of files) {
    if (token?.isCancellationRequested) return;
    const doc = await vscode.workspace.openTextDocument(file);
    const text = doc.getText();
    const rel = relativePath(workspaceFolder, file);
    const pieces = chunk(text, maxChars, overlap);

    for (const p of pieces) {
      entries.push({
        id: `${rel}:${p.start}-${p.end}`,
        file: rel,
        start: p.start,
        end: p.end,
        text: p.text,
        vector: [] // fill after embeddings
      });
    }
  }

  // embed all texts in batches
  const vectors = await embedTexts(entries.map(e => e.text));
  for (let i = 0; i < entries.length; i++) entries[i].vector = vectors[i];

  index.setEntries(entries);
  await index.save();
}

export async function updateFile(workspaceFolder: vscode.Uri, fileUri: vscode.Uri) {
  // Quick incremental update for a single file: rebuild only this file and merge.
  const { maxChars, overlap } = cfg();
  const index = new SimpleIndex(workspaceFolder);
  await index.load();

  const rel = relativePath(workspaceFolder, fileUri);
  const doc = await vscode.workspace.openTextDocument(fileUri);
  const pieces = chunk(doc.getText(), maxChars, overlap);

  // remove old entries for this file
  const rest = index.getEntries().filter(e => e.file !== rel);

  const newEntries: IndexEntry[] = pieces.map(p => ({
    id: `${rel}:${p.start}-${p.end}`,
    file: rel, start: p.start, end: p.end, text: p.text, vector: []
  }));

  const vectors = await embedTexts(newEntries.map(e => e.text));
  for (let i = 0; i < newEntries.length; i++) newEntries[i].vector = vectors[i];

  index.setEntries([...rest, ...newEntries]);
  await index.save();
}
