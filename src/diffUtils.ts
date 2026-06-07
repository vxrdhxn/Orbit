import { DiffHunk } from './reasoning/types';

/**
 * Extract a unified diff from model output.
 * Supports plain unified diff or fenced blocks ```diff / ```patch.
 */
export function extractUnifiedDiff(text: string): string | null {
    // Try fenced blocks first
    const fence = text.match(/```(?:diff|patch)\s*([\s\S]*?)```/i);
    if (fence) {return fence[1].trim();}

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
export function applyUnifiedDiff(original: string, diff: string): string {
    const hunks = HunkParser.parse(diff);
    return PartialDiffApplicator.apply(original, hunks);
}

/**
 * Parses a unified diff into individual manageable hunks.
 */
export class HunkParser {
    static parse(diff: string): DiffHunk[] {
        const hunks: DiffHunk[] = [];
        const lines = diff.replace(/\r\n/g, '\n').split('\n');
        let currentHunk: Partial<DiffHunk> | null = null;

        for (const line of lines) {
            if (line.startsWith('@@')) {
                if (currentHunk) {
                    hunks.push(currentHunk as DiffHunk);
                }
                const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
                if (match) {
                    currentHunk = {
                        id: Math.random().toString(36).substring(7),
                        oldStart: parseInt(match[1], 10),
                        oldLen: match[2] ? parseInt(match[2], 10) : 1,
                        newStart: parseInt(match[3], 10),
                        newLen: match[4] ? parseInt(match[4], 10) : 1,
                        header: line,
                        lines: []
                    };
                }
            } else if (currentHunk) {
                // Unified diff content lines must start with ' ', '+', '-', or '\'
                if (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-') || line.startsWith('\\')) {
                    currentHunk.lines?.push(line);
                } else if (line.trim() !== '' && !line.startsWith('---') && !line.startsWith('+++')) {
                    // If we encounter a non-empty line that isn't a diff marker, the hunk is likely over
                    hunks.push(currentHunk as DiffHunk);
                    currentHunk = null;
                }
            }
        }

        if (currentHunk) {
            hunks.push(currentHunk as DiffHunk);
        }

        return hunks;
    }
}

/**
 * Applies a subset of hunks to original content.
 */
export class PartialDiffApplicator {
    static apply(original: string, hunks: DiffHunk[], selectedIds?: string[]): string {
        const origLines = original.replace(/\r\n/g, '\n').split('\n');

        // Filter and sort active hunks
        const activeHunks = (selectedIds
            ? hunks.filter(h => selectedIds.includes(h.id))
            : hunks
        ).sort((a, b) => a.oldStart - b.oldStart);

        let out: string[] = [];
        let origPos = 1; // 1-based line numbers

        for (const hunk of activeHunks) {
            // Copy unchanged lines up to the hunk start
            while (origPos < hunk.oldStart && origPos - 1 < origLines.length) {
                out.push(origLines[origPos - 1]);
                origPos++;
            }

            // Process hunk lines
            for (const line of hunk.lines) {
                if (line.startsWith(' ')) {
                    // context
                    if (origPos - 1 < origLines.length) {
                        out.push(origLines[origPos - 1]);
                        origPos++;
                    }
                } else if (line.startsWith('-')) {
                    // removal
                    if (origPos - 1 < origLines.length) {
                        origPos++;
                    }
                } else if (line.startsWith('+')) {
                    // addition
                    out.push(line.slice(1));
                }
                // ignore '\ No newline at end of file' and other markers
            }
        }

        // Append remaining original lines
        while (origPos - 1 < origLines.length) {
            out.push(origLines[origPos - 1]);
            origPos++;
        }

        return out.join('\n');
    }
}
