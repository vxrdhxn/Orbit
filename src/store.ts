import * as vscode from 'vscode';
import * as path from 'path';

export type IndexEntry = {
  id: string;            // file + range
  file: string;          // relative path
  start: number;         // start char offset in file
  end: number;           // end char offset in file
  text: string;          // chunk content
  vector: number[];      // embedding
};

export type IndexData = {
  version: number;
  createdAt: string;
  entries: IndexEntry[];
};

export class SimpleIndex {
  private indexPath: vscode.Uri;
  private data: IndexData = { version: 1, createdAt: new Date().toISOString(), entries: [] };

  constructor(private workspaceFolder: vscode.Uri) {
    const folder = vscode.Uri.joinPath(workspaceFolder, '.devmind');
    this.indexPath = vscode.Uri.joinPath(folder, 'index.json');
  }

  async ensureFolder() {
    const dir = vscode.Uri.joinPath(this.workspaceFolder, '.devmind');
    try { await vscode.workspace.fs.createDirectory(dir); } catch { /* ok */ }
  }

  async load(): Promise<void> {
    await this.ensureFolder();
    try {
      const buf = await vscode.workspace.fs.readFile(this.indexPath);
      const text = new TextDecoder().decode(buf);
      const parsed = JSON.parse(text) as IndexData;
      if (parsed && Array.isArray(parsed.entries)) this.data = parsed;
    } catch {
      // no index yet; keep empty
    }
  }

  async save(): Promise<void> {
    await this.ensureFolder();
    const text = JSON.stringify(this.data, null, 2);
    await vscode.workspace.fs.writeFile(this.indexPath, new TextEncoder().encode(text));
  }

  clear() {
    this.data = { version: 1, createdAt: new Date().toISOString(), entries: [] };
  }

  setEntries(entries: IndexEntry[]) {
    this.data.entries = entries;
  }

  getEntries(): IndexEntry[] {
    return this.data.entries;
  }
}

// cosine similarity
export function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function relativePath(workspace: vscode.Uri, file: vscode.Uri) {
  const p = path.relative(workspace.fsPath, file.fsPath).replace(/\\/g, '/');
  return p || path.basename(file.fsPath);
}
