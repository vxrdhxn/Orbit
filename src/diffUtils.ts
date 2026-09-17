import { DiffHunk } from './reasoning/types';
import * as diff from 'diff';

/**
 * Generate a unified diff from original to modified.
 */
export function generateUnifiedDiff(original: string, modified: string, fileName: string = 'file'): string {
    return diff.createPatch(fileName, original, modified, '', '', { context: 3 });
}

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
    static apply(
        original: string,
        hunks: DiffHunk[],
        selectedIds?: string[]
    ): string {
        const origLines = original
            .replace(/\r\n/g, '\n')
            .split('\n');

        const activeHunks = (
            selectedIds
                ? hunks.filter(hunk => selectedIds.includes(hunk.id))
                : hunks
        )
            .slice()
            .sort((a, b) => a.oldStart - b.oldStart);

        let output: string[] = [];
        let originalPosition = 1;

        for (const hunk of activeHunks) {
            if (
                !Number.isInteger(hunk.oldStart) ||
                !Number.isInteger(hunk.oldLen) ||
                hunk.oldStart < 1 ||
                hunk.oldLen < 0
            ) {
                throw new Error('Invalid diff hunk metadata.');
            }

            if (hunk.oldStart < originalPosition) {
                throw new Error(
                    'Overlapping or incorrectly ordered diff hunks.'
                );
            }

            while (
                originalPosition < hunk.oldStart &&
                originalPosition <= origLines.length
                ) {
                output.push(origLines[originalPosition - 1]);
                originalPosition++;
            }

            let consumedLines = 0;

            for (const line of hunk.lines) {
                if (line.startsWith(' ')) {
                    const expectedLine = line.slice(1);
                    const actualLine = origLines[originalPosition - 1];

                    if (
                        originalPosition > origLines.length ||
                        actualLine !== expectedLine
                    ) {
                        throw new Error(
                            'Diff context does not match the current file.'
                        );
                    }

                    output.push(actualLine);
                    originalPosition++;
                    consumedLines++;
                } else if (line.startsWith('-')) {
                    const expectedLine = line.slice(1);
                    const actualLine = origLines[originalPosition - 1];

                    if (
                        originalPosition > origLines.length ||
                        actualLine !== expectedLine
                    ) {
                        throw new Error(
                            'Diff removal does not match the current file.'
                        );
                    }

                    originalPosition++;
                    consumedLines++;
                } else if (line.startsWith('+')) {
                    output.push(line.slice(1));
                }
            }

            if (consumedLines !== hunk.oldLen) {
                throw new Error(
                    'Diff hunk line count does not match its metadata.'
                );
            }
        }

        while (originalPosition <= origLines.length) {
            output.push(origLines[originalPosition - 1]);
            originalPosition++;
        }

        return output.join('\n');
    }
}
