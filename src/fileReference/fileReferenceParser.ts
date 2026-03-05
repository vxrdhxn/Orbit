import * as vscode from 'vscode';
import * as path from 'path';

export interface FileReference {
    raw: string;              // Original text from message
    path: string;             // Resolved absolute file path
    lineRange?: {             // Optional line range
        start: number;
        end: number;
    };
    syntax: 'backtick' | 'hash' | 'plain';  // Detection method
    isValid: boolean;         // Whether the file exists
}

export class FileReferenceParser {

    /**
     * Parse message text and extract file references
     */
    async parse(message: string): Promise<FileReference[]> {
        const references: FileReference[] = [];
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }
        const workspaceRoot = workspaceFolders[0].uri.fsPath;

        // 1. Detect Backtick syntax: `path/to/file`
        // Matches `path` or `path:lines`
        const backtickRegex = /`([^`]+)`/g;
        let match;
        while ((match = backtickRegex.exec(message)) !== null) {
            const content = match[1];
            // Basic heuristic: check if it looks like a file path (contains / or \ or extension)
            if (this.looksLikeFilePath(content)) {
                const ref = await this.resolveReference(content, workspaceRoot, 'backtick', match[0]);
                if (ref) {
                    references.push(ref);
                }
            }
        }

        // 2. Detect Hash syntax: #path/to/file
        // Matches #path until whitespace
        const hashRegex = /#([^\s]+)/g;
        while ((match = hashRegex.exec(message)) !== null) {
            const content = match[1];
            const ref = await this.resolveReference(content, workspaceRoot, 'hash', match[0]);
            if (ref) {
                references.push(ref);
            }
        }

        // 3. Detect Plain text (Unique Filename) - This is more expensive and risky, 
        // usually enabled if specific user intent is clear or via a more restricted trigger.
        // For V1, we might skip "plain text" auto-detection to avoid false positives 
        // unless it's a very specific file name. 
        // Let's implement a limited version: if a word strictly matches a known file in the workspace.
        // Implementation deferred to "exact match" logic later if needed to avoid noise.

        return references;
    }

    private looksLikeFilePath(text: string): boolean {
        // Must check if it has extension or path separators
        return /[\\\/]|(\.[a-zA-Z0-9]+$)/.test(text);
    }

    private async resolveReference(rawContent: string, workspaceRoot: string, syntax: 'backtick' | 'hash', originalRaw: string): Promise<FileReference | null> {
        // Split line range if exists (e.g., file.ts:1-10)
        // Be careful with windows paths like C:\... but usually relative paths don't start with drive letter in this context
        const parts = rawContent.split(':');
        let filePathPart = parts[0];
        let lineRangePart = parts.length > 1 ? parts[parts.length - 1] : undefined;

        // If the last part is not numeric/range, it might be part of the filename (unlikely for : separator but possible)
        // Adjusting logic: usually :LineNumber or :Start-End
        let lineRange: { start: number; end: number } | undefined;

        if (parts.length > 1) {
            const potentialRange = parts[parts.length - 1];
            if (/^\d+(-\d*)?$/.test(potentialRange)) {
                lineRangePart = potentialRange;
                filePathPart = rawContent.substring(0, rawContent.lastIndexOf(':'));

                const rangeNums = lineRangePart.split('-').map(Number);
                lineRange = {
                    start: rangeNums[0],
                    end: rangeNums.length > 1 && rangeNums[1] !== 0 ? rangeNums[1] : rangeNums[0] // handle trailing - as "rest of file" logic later, for now simple end
                };
            } else {
                // No valid range found, treat whole string as path
                filePathPart = rawContent;
            }
        }

        // Resolve absolute path
        let resolvedPath = filePathPart;
        if (!path.isAbsolute(filePathPart)) {
            resolvedPath = path.join(workspaceRoot, filePathPart);
        }

        // Verify existence
        let isValid = false;
        try {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.file(resolvedPath));
            if (stat.type === vscode.FileType.File) {
                isValid = true;
            }
        } catch (e) {
            // Try resolving as exact filename in workspace if not found? 
            // For now, strict relative path.
            isValid = false;
        }

        // If strict relative path failed, we could try "find file by name" logic here
        // But for V1 let's stick to relative paths or absolute paths detection.

        if (!isValid && !path.isAbsolute(filePathPart)) {
            // Attempt to find by filename if it's just a name
            if (!filePathPart.includes('/') && !filePathPart.includes('\\')) {
                const files = await vscode.workspace.findFiles(`**/${filePathPart}`, '**/node_modules/**', 2);
                if (files.length === 1) {
                    resolvedPath = files[0].fsPath;
                    isValid = true;
                }
            }
        }

        if (isValid) {
            return {
                raw: originalRaw,
                path: resolvedPath,
                lineRange,
                syntax,
                isValid
            };
        }

        // Return detected but invalid reference so UI can show "File not found"
        return {
            raw: originalRaw,
            path: resolvedPath, // Best guess
            lineRange,
            syntax,
            isValid: false
        };
    }
}
