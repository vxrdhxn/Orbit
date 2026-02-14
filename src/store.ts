import * as vscode from 'vscode';
import * as path from 'path';
import { IndexEntry, IndexData } from './common';

export { IndexEntry, IndexData, cosine } from './common';

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


export function relativePath(workspace: vscode.Uri, file: vscode.Uri) {
  const p = path.relative(workspace.fsPath, file.fsPath).replace(/\\/g, '/');
  return p || path.basename(file.fsPath);
}
