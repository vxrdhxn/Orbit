export interface StructuredResponse {
    what: string[];
    why: string;
    improvements: string;
    tradeoffs: string;
    production: string;
}

export interface Attachment {
    path: string;
    name: string;
}

export interface Message {
    role: 'user' | 'ai' | 'system';
    content: string;
    /** Files attached to a user message (absolute paths). */
    attachments?: string[];
    /** Image preview (data URL) shown on a user message in this session. */
    image?: string;
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
