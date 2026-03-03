import { Finding, FindingCategory, SeverityLevel } from '../../../src/reviewTypes';
import { CommentConsolidator } from '../../../src/services/CommentConsolidator';

describe('CommentConsolidator', () => {
    it('should not change findings on different lines', () => {
        const findings: Finding[] = [
            {
                id: '1',
                category: FindingCategory.Bug,
                severity: SeverityLevel.Critical,
                title: 'Bug 1',
                description: 'Desc 1',
                location: { fileName: 'file1.ts', startLine: 10, endLine: 10, snippet: 'code1' }
            },
            {
                id: '2',
                category: FindingCategory.Style,
                severity: SeverityLevel.Info,
                title: 'Style 1',
                description: 'Desc 2',
                location: { fileName: 'file1.ts', startLine: 20, endLine: 20, snippet: 'code2' }
            }
        ];

        const consolidated = CommentConsolidator.consolidate(findings);
        expect(consolidated).toHaveLength(2);
        expect(consolidated[0].id).toBe('1');
        expect(consolidated[1].id).toBe('2');
    });

    it('should merge findings on the same line', () => {
        const findings: Finding[] = [
            {
                id: '1',
                category: FindingCategory.Bug,
                severity: SeverityLevel.Critical,
                title: 'Bug 1',
                description: 'Desc 1',
                location: { fileName: 'file1.ts', startLine: 10, endLine: 10, snippet: 'code1' },
                reasoning: {
                    what: ['Change 1'],
                    why: 'Reason 1',
                    improvements: 'Imp 1',
                    tradeoffs: 'Trade 1',
                    production: 'Prod 1'
                }
            },
            {
                id: '2',
                category: FindingCategory.Performance,
                severity: SeverityLevel.Warning,
                title: 'Perf 1',
                description: 'Desc 2',
                location: { fileName: 'file1.ts', startLine: 10, endLine: 10, snippet: 'code1' },
                reasoning: {
                    what: ['Change 2'],
                    why: 'Reason 2',
                    improvements: 'Imp 2',
                    tradeoffs: 'Trade 2',
                    production: 'Prod 2'
                }
            }
        ];

        const consolidated = CommentConsolidator.consolidate(findings);
        expect(consolidated).toHaveLength(1);
        expect(consolidated[0].title).toBe('Multiple Issues: 2');

        const reasoning = consolidated[0].reasoning!;
        expect(reasoning.what).toContain('Change 1');
        expect(reasoning.what).toContain('Change 2');
        expect(reasoning.why).toContain('Issue 1: Reason 1');
        expect(reasoning.why).toContain('Issue 2: Reason 2');
    });

    it('should handle findings without reasoning gracefully', () => {
        const findings: Finding[] = [
            {
                id: '1',
                category: FindingCategory.Bug,
                severity: SeverityLevel.Critical,
                title: 'Bug 1',
                description: 'Desc 1',
                location: { fileName: 'file1.ts', startLine: 10, endLine: 10, snippet: 'code1' }
            },
            {
                id: '2',
                category: FindingCategory.Bug,
                severity: SeverityLevel.Critical,
                title: 'Bug 2',
                description: 'Desc 2',
                location: { fileName: 'file1.ts', startLine: 10, endLine: 10, snippet: 'code1' }
            }
        ];

        const consolidated = CommentConsolidator.consolidate(findings);
        expect(consolidated).toHaveLength(1);
        expect(consolidated[0].reasoning?.what).toHaveLength(0);
    });
});
