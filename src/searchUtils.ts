import { IndexEntry, cosine } from './common';

export function rankEntries(entries: IndexEntry[], queryVector: number[], topK: number): Array<{ entry: IndexEntry, score: number }> {
    return entries.map(e => ({ entry: e, score: cosine(queryVector, e.vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
}
