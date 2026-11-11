import * as diff from 'diff';

/**
 * What the user asked to do to a file, judged from their message.
 *
 * - 'add':    only add code (add, write, insert, append, create, print...).
 *             Existing code must stay.
 * - 'modify': change, replace, remove, fix or rewrite existing code, so
 *             removing lines is allowed.
 */
export type EditIntent = 'add' | 'modify';

const MODIFY_WORDS = /\b(remove|delete|drop|clear|erase|replace|replaces|replacing|rewrite|rename|change|changing|modify|update|fix|refactor|convert|migrate|move|swap|edit|optimi[sz]e|clean ?up|simplify|instead|undo|revert|reorder|sort|format|restructure|wrap)\b/i;

export function classifyEditIntent(userMsg: string): EditIntent {
    return MODIFY_WORDS.test(userMsg) ? 'modify' : 'add';
}

function normalize(line: string): string {
    return line.replace(/\s+/g, '').replace(/;$/, '');
}

export interface PreserveResult {
    content: string;
    /** Original lines that the proposal dropped and were put back. */
    restoredLines: number;
}

/**
 * For an "add" request, makes sure no existing code is lost.
 *
 * Small models often return only the new code instead of the whole file. Any
 * original line that is missing from the proposal (ignoring whitespace, so
 * moved or re-indented lines count as kept) is put back where it was, before
 * the new code at that position.
 */
export function preserveExistingCode(original: string, proposed: string): PreserveResult {
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const originalLines = original.split(/\r?\n/);
    const proposedLines = proposed.split(/\r?\n/);
    const kept = new Set(proposedLines.map(normalize));

    const out: string[] = [];
    let restoredLines = 0;

    for (const part of diff.diffArrays(originalLines, proposedLines)) {
        const lines = part.value as string[];
        if (part.removed) {
            for (const line of lines) {
                const key = normalize(line);
                if (key !== '' && !kept.has(key)) {
                    out.push(line);
                    restoredLines++;
                }
            }
        } else {
            out.push(...lines);
        }
    }

    if (restoredLines === 0) {
        return { content: proposed, restoredLines: 0 };
    }
    return { content: out.join(eol), restoredLines };
}

/** Counts added and removed lines between two versions, for a short summary. */
export function countLineChanges(original: string, updated: string): { added: number; removed: number } {
    let added = 0;
    let removed = 0;
    for (const part of diff.diffArrays(original.split(/\r?\n/), updated.split(/\r?\n/))) {
        const count = (part.value as string[]).filter(l => l.trim() !== '').length;
        if (part.added) {
            added += count;
        } else if (part.removed) {
            removed += count;
        }
    }
    return { added, removed };
}
