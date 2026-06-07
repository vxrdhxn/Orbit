export type IndexEntry = {
    id: string;            // file + range
    file: string;          // relative path
    start: number;         // start char offset in file
    end: number;           // end char offset in file
    text: string;          // chunk content
    vector: number[];      // embedding
};

export type IndexData = {
    version: number;
    createdAt: string;
    entries: IndexEntry[];
};

// cosine similarity
export function cosine(a: number[], b: number[]) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length && i < b.length; i++) {
        dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
    }
    if (!na || !nb) {return 0;}
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
