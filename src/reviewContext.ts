import * as vscode from 'vscode';
import { SimpleIndex } from './store';
import { CodeInput, ProjectContext } from './reviewTypes';
import { embedOne } from './embeddings';
import { rankEntries } from './searchUtils';

export class ContextGatherer {
    constructor(private index: SimpleIndex) { }

    async gatherContext(code: CodeInput[], options: { includeContext: boolean }): Promise<ProjectContext> {
        if (!options.includeContext) {
            return { similarCode: [], namingConventions: {}, commonPatterns: [] };
        }

        const context: ProjectContext = {
            similarCode: [],
            namingConventions: {},
            commonPatterns: []
        };

        try {
            // Ensure index is loaded
            await this.index.load();
            const entries = this.index.getEntries();
            if (entries.length === 0) {return context;}

            const queries = code.map(c => c.content.split('\n').slice(0, 10).join('\n'));

            for (const query of queries) {
                if (!query.trim()) {continue;}

                const qvec = await embedOne(query);
                const results = rankEntries(entries, qvec, 3); // Top 3 per file

                for (const res of results) {
                    const isInputFile = code.some(c => c.fileName.endsWith(res.entry.file));
                    if (!isInputFile) {
                        context.similarCode.push({
                            file: res.entry.file,
                            snippet: res.entry.text,
                            score: res.score
                        });
                    }
                }
            }

            context.similarCode = context.similarCode.filter((v, i, a) => a.findIndex(t => t.file === v.file && t.snippet === v.snippet) === i);

        } catch (e) {
            console.error("Context gathering failed", e);
        }

        return context;
    }

    async findSimilarPatterns(code: string): Promise<any[]> {
        try {
            await this.index.load();
            const entries = this.index.getEntries();
            if (entries.length === 0) {return [];}

            const qvec = await embedOne(code);
            return rankEntries(entries, qvec, 5);
        } catch (e) {
            console.error("Pattern search failed", e);
            return [];
        }
    }
}
