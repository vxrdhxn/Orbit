export class ComplexityDetector {
    /**
     * Detects time complexity based on code patterns.
     * This is a heuristic-based approach to assist the LLM.
     */
    public detectTimeComplexity(code: string): string {
        const lines = code.split('\n');
        let maxDepth = 0;
        let currentDepth = 0;

        for (const line of lines) {
            const trimmed = line.trim();
            if (this.isLoop(trimmed)) {
                currentDepth++;
                maxDepth = Math.max(maxDepth, currentDepth);
            } else if (trimmed.includes('}') || trimmed.includes('end')) { // Basic block end detection
                if (currentDepth > 0) {currentDepth--;}
            }
        }

        if (this.isRecursive(code)) {
            return 'O(2^n) or O(n!) - Potential exponential growth detected via recursion';
        }

        switch (maxDepth) {
            case 0: return 'O(1)';
            case 1: return 'O(n)';
            case 2: return 'O(n^2)';
            case 3: return 'O(n^3)';
            default: return `O(n^${maxDepth})`;
        }
    }

    /**
     * Detects space complexity based on code patterns.
     */
    public detectSpaceComplexity(code: string): string {
        if (code.includes('new Array') || code.includes('[]') || code.includes('new Set') || code.includes('new Map')) {
            if (this.isLoop(code)) {
                return 'O(n) - Data structure initialized within or proportionate to loop';
            }
            return 'O(n) - Potential linear space for data structures';
        }
        return 'O(1) - Constant space detected';
    }

    private isLoop(line: string): boolean {
        const loopKeywords = ['for ', 'while ', '.forEach', '.map', '.filter', '.reduce'];
        return loopKeywords.some(keyword => line.includes(keyword));
    }

    private isRecursive(code: string): boolean {
        const match = code.match(/function\s+([a-zA-Z0-9_]+)/) || code.match(/(?:const|let)\s+([a-zA-Z0-9_]+)\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>/);
        if (!match) {return false;}

        const name = match[1];
        const regex = new RegExp(`\\b${name}\\s*\\(`, 'g');
        const occurrences = code.match(regex);
        return occurrences ? occurrences.length > 1 : false;
    }
}
