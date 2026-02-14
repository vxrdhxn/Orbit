/**
 * Extract a unified diff from model output.
 * Supports plain unified diff or fenced blocks ```diff / ```patch.
 */
export function extractUnifiedDiff(text: string): string | null {
    // Try fenced blocks first
    const fence = text.match(/```(?:diff|patch)\s*([\s\S]*?)```/i);
    if (fence) return fence[1].trim();

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
    // Normalize line endings to \n
    const origLines = original.replace(/\r\n/g, '\n').split('\n');

    const lines = diff.replace(/\r\n/g, '\n').split('\n');

    // Skip headers (diff --git, index, ---/+++)
    let i = 0;
    while (i < lines.length && !lines[i].startsWith('@@')) i++;
    if (i >= lines.length) {
        // maybe headers come later; try to find first hunk header
        const j = lines.findIndex(l => l.startsWith('@@'));
        if (j === -1) throw new Error('No hunk header (@@) found in diff.');
        i = j;
    }

    let out: string[] = [];
    let origPos = 1; // 1-based line numbers

    function appendOrigUntil(target1Based: number) {
        // copy original lines from current position up to target-1
        while (origPos < target1Based && origPos - 1 < origLines.length) {
            out.push(origLines[origPos - 1]);
            origPos++;
        }
    }

    while (i < lines.length) {
        if (!lines[i].startsWith('@@')) {
            // skip stray lines until a hunk starts
            i++;
            continue;
        }

        // Parse hunk header: @@ -a,b +c,d @@ optional text
        const m = lines[i].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (!m) throw new Error(`Bad hunk header: ${lines[i]}`);
        const oldStart = parseInt(m[1], 10);
        // const oldLen = m[2] ? parseInt(m[2], 10) : 1;
        // const newStart = parseInt(m[3], 10);
        // const newLen = m[4] ? parseInt(m[4], 10) : 1;

        i++;

        // Copy unchanged lines up to the hunk start
        appendOrigUntil(oldStart);

        // Now process hunk lines until next '@@' or EOF
        while (i < lines.length && !lines[i].startsWith('@@')) {
            const line = lines[i];
            if (line.startsWith(' ')) {
                // context: copy one line from original
                if (origPos - 1 >= origLines.length) {
                    // context beyond EOF — tolerate by treating as empty
                    out.push(line.slice(1));
                } else {
                    out.push(origLines[origPos - 1]);
                }
                origPos++;
            } else if (line.startsWith('-')) {
                // removal: advance original, don't add to out
                origPos++;
            } else if (line.startsWith('+')) {
                // addition: add to out, don't advance original
                out.push(line.slice(1));
            } else if (line.startsWith('\\')) {
                // "\ No newline at end of file" — ignore
            } else if (line.trim() === '') {
                // blank line in diff context — treat as context?
                out.push('');
            } else {
                // Unknown marker (safety): treat as context
                out.push(line);
                origPos++;
            }
            i++;
            if (i >= lines.length) break;
        }
    }

    // Append remaining original lines
    while (origPos - 1 < origLines.length) {
        out.push(origLines[origPos - 1]);
        origPos++;
    }

    return out.join('\n');
}
