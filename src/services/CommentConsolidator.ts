import { Finding } from '../reviewTypes';
import { StructuredResponse } from '../reasoning/types';

export class CommentConsolidator {
    /**
     * Consolidates multiple findings on the same line into a single finding.
     * Merges their structured reasoning fields.
     */
    public static consolidate(findings: Finding[]): Finding[] {
        const groupedMap = new Map<string, Finding[]>();

        findings.forEach(finding => {
            const key = `${finding.location.fileName}:${finding.location.startLine}`;
            if (!groupedMap.has(key)) {
                groupedMap.set(key, []);
            }
            groupedMap.get(key)!.push(finding);
        });

        const consolidated: Finding[] = [];

        groupedMap.forEach((lineFindings, key) => {
            if (lineFindings.length === 1) {
                consolidated.push(lineFindings[0]);
                return;
            }

            // Merge findings on the same line
            const base = lineFindings[0];
            const mergedReasoning: StructuredResponse = {
                what: [],
                why: '',
                improvements: '',
                tradeoffs: '',
                production: ''
            };

            const titles: string[] = [];
            const descriptions: string[] = [];

            lineFindings.forEach((f, index) => {
                titles.push(f.title);
                descriptions.push(f.description);

                if (f.reasoning) {
                    mergedReasoning.what.push(...(f.reasoning.what || []));

                    if (f.reasoning.why) {
                        mergedReasoning.why += (mergedReasoning.why ? '\n\n' : '') + `Issue ${index + 1}: ${f.reasoning.why}`;
                    }
                    if (f.reasoning.improvements) {
                        mergedReasoning.improvements += (mergedReasoning.improvements ? '\n\n' : '') + `Issue ${index + 1}: ${f.reasoning.improvements}`;
                    }
                    if (f.reasoning.tradeoffs) {
                        mergedReasoning.tradeoffs += (mergedReasoning.tradeoffs ? '\n\n' : '') + `Issue ${index + 1}: ${f.reasoning.tradeoffs}`;
                    }
                    if (f.reasoning.production) {
                        mergedReasoning.production += (mergedReasoning.production ? '\n\n' : '') + `Issue ${index + 1}: ${f.reasoning.production}`;
                    }
                }
            });

            // Create a new consolidated finding
            const consolidatedFinding: Finding = {
                ...base,
                id: `${base.id}-consolidated`,
                title: `Multiple Issues: ${titles.length}`,
                description: descriptions.join('\n\n'),
                reasoning: mergedReasoning
            };

            consolidated.push(consolidatedFinding);
        });

        return consolidated;
    }
}
