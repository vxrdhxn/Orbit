import * as fs from 'fs/promises';

export interface FileContent {
    path: string;
    content: string;
    size: number;
    truncated: boolean;
}

export interface ReadOptions {
    maxSize?: number;         // Max file size in bytes
    lineRange?: {
        start: number;
        end: number;
    };
}

export class FileContentReader {
    private static readonly DEFAULT_MAX_SIZE = 500 * 1024; // 500KB

    /**
     * Read file contents with optional line range
     */
    async read(filePath: string, options?: ReadOptions): Promise<FileContent> {
        const maxSize = options?.maxSize ?? FileContentReader.DEFAULT_MAX_SIZE;

        try {
            const stats = await fs.stat(filePath);
            const fileSize = stats.size;

            if (fileSize > maxSize && !options?.lineRange) {
                throw new Error(`File is too large (${(fileSize / 1024).toFixed(1)}KB). Max allowed: ${(maxSize / 1024).toFixed(1)}KB`);
            }

            let content: string;

            if (options?.lineRange) {
                // Read specifics lines
                content = await this.readLines(filePath, options.lineRange.start, options.lineRange.end);
            } else {
                // Read full file
                content = await fs.readFile(filePath, 'utf-8');
            }

            return {
                path: filePath,
                content: content,
                size: content.length,
                truncated: false
            };
        } catch (error: any) {
            throw new Error(`Failed to read file ${filePath}: ${error.message}`);
        }
    }

    /**
     * Check file size before reading
     */
    async getFileSize(filePath: string): Promise<number> {
        try {
            const stats = await fs.stat(filePath);
            return stats.size;
        } catch {
            return -1;
        }
    }

    /**
     * Read specific line range from file (1-based index)
     */
    async readLines(filePath: string, start: number, end: number): Promise<string> {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split(/\r?\n/);

        // Adjust for 0-based array vs 1-based user input
        const startIndex = Math.max(0, start - 1);
        const endIndex = end ? Math.min(lines.length, end) : lines.length;

        if (startIndex >= lines.length) {
            return '';
        }

        return lines.slice(startIndex, endIndex).join('\n');
    }
}
