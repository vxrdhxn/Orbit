import * as vscode from 'vscode';
import * as path from 'path';

export interface RecentFile {
    path: string;
    relativePath: string;
    lastUsed: number;
}

export class FileReferenceManager {
    private recentFiles: Map<string, RecentFile> = new Map();
    private readonly MAX_RECENT = 20;

    constructor(private context: vscode.ExtensionContext) {
        // Load recent files from globalState or workspaceState
        const saved = this.context.workspaceState.get<RecentFile[]>('orbit.recentFiles', []);
        saved.forEach(f => this.recentFiles.set(f.path, f));
    }

    addRecentFile(filePath: string) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {return;}
        const root = workspaceFolders[0].uri.fsPath;

        const relativePath = path.relative(root, filePath);

        this.recentFiles.set(filePath, {
            path: filePath,
            relativePath,
            lastUsed: Date.now()
        });

        this.persist();
    }

    getRecentFiles(): RecentFile[] {
        return Array.from(this.recentFiles.values())
            .sort((a, b) => b.lastUsed - a.lastUsed)
            .slice(0, this.MAX_RECENT);
    }

    async searchFiles(query: string): Promise<string[]> {
        // Find files matching pattern
        // If query is empty, return everything (limit to some sane number)
        // If query has text, fuzzy match

        const pattern = query ? `**/*${query}*/**` : '**/*';
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 50);
        return files.map(f => f.fsPath);
    }

    private persist() {
        const sorted = this.getRecentFiles();
        this.context.workspaceState.update('orbit.recentFiles', sorted);
    }
}
