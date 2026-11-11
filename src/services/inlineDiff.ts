import * as diff from 'diff';

/**
 * Line-level model behind the inline change review.
 *
 * The file is split into unchanged runs and change hunks. While a hunk is
 * pending, the editor shows its removed lines (red) followed by its added
 * lines (green). Accepting a hunk keeps the added lines, rejecting keeps the
 * removed ones.
 */

export type HunkDecision = 'pending' | 'accepted' | 'rejected';

export interface SameSegment {
    kind: 'same';
    lines: string[];
}

export interface ChangeSegment {
    kind: 'change';
    removed: string[];
    added: string[];
    decision: HunkDecision;
}

export type Segment = SameSegment | ChangeSegment;

export interface RenderedHunk {
    /** Index into the list of change segments. */
    index: number;
    /** First line of the hunk in the rendered text (0-based). */
    startLine: number;
    decision: HunkDecision;
}

export interface RenderResult {
    lines: string[];
    /** Rendered line numbers of pending added lines. */
    addedLines: number[];
    /** Rendered line numbers of pending removed lines. */
    removedLines: number[];
    hunks: RenderedHunk[];
}

export function splitLines(text: string): string[] {
    return text.split(/\r?\n/);
}

export function computeSegments(original: string, proposed: string): Segment[] {
    const parts = diff.diffArrays(splitLines(original), splitLines(proposed));
    const segments: Segment[] = [];

    for (const part of parts) {
        const lines = part.value as string[];
        if (!part.added && !part.removed) {
            segments.push({ kind: 'same', lines });
            continue;
        }
        let last = segments[segments.length - 1];
        if (!last || last.kind !== 'change') {
            last = { kind: 'change', removed: [], added: [], decision: 'pending' };
            segments.push(last);
        }
        if (part.added) {
            last.added.push(...lines);
        } else {
            last.removed.push(...lines);
        }
    }
    return segments;
}

export function changeSegments(segments: Segment[]): ChangeSegment[] {
    return segments.filter((s): s is ChangeSegment => s.kind === 'change');
}

export function render(segments: Segment[]): RenderResult {
    const result: RenderResult = { lines: [], addedLines: [], removedLines: [], hunks: [] };
    let hunkIndex = 0;

    for (const segment of segments) {
        if (segment.kind === 'same') {
            result.lines.push(...segment.lines);
            continue;
        }

        result.hunks.push({ index: hunkIndex++, startLine: result.lines.length, decision: segment.decision });

        if (segment.decision === 'pending') {
            for (const line of segment.removed) {
                result.removedLines.push(result.lines.length);
                result.lines.push(line);
            }
            for (const line of segment.added) {
                result.addedLines.push(result.lines.length);
                result.lines.push(line);
            }
        } else if (segment.decision === 'accepted') {
            result.lines.push(...segment.added);
        } else {
            result.lines.push(...segment.removed);
        }
    }
    return result;
}

export function allDecided(segments: Segment[]): boolean {
    return changeSegments(segments).every(s => s.decision !== 'pending');
}
