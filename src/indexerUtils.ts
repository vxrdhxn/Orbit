// simple chunker: greedy by characters, trying to break on blank lines where possible
export function chunk(text: string, maxChars: number, overlap: number): { start: number; end: number; text: string }[] {
    const chunks: { start: number; end: number; text: string }[] = [];
    let i = 0;
    while (i < text.length) {
        let end = Math.min(i + maxChars, text.length);
        // try to end on a blank line boundary within the last 150 chars
        const windowStart = Math.max(i, end - 150);
        const slice = text.slice(windowStart, end);
        const rel = slice.lastIndexOf('\n\n');
        if (rel > -1) end = windowStart + rel + 2;

        const t = text.slice(i, end);
        chunks.push({ start: i, end, text: t });
        if (end >= text.length) break;
        i = Math.max(end - overlap, 0);
    }
    return chunks;
}
