export interface StructuredResponse {
    what: string[];
    why: string;
    improvements: string;
    tradeoffs: string;
    production: string;
}

export interface Message {
    role: 'user' | 'ai' | 'system';
    content: string;
}

export interface DiffHunk {
    id: string;
    oldStart: number;
    oldLen: number;
    newStart: number;
    newLen: number;
    header: string;
    lines: string[];
}

export interface DiffProposal {
    id: string;
    fileName: string;
    fullDiff: string;
    hunks: DiffHunk[];
    reasoning: StructuredResponse;
    timestamp: number;
}
