import { ReviewService } from '../../src/reviewService';
import { SeverityLevel } from '../../src/reviewTypes';
import { DecisionJournal } from '../../src/memory/DecisionJournal';

describe('review category filter', () => {
    it('reports every category when the list is empty (as Orbit Pilot passes it)', async () => {
        const llm: any = {
            generate: jest.fn().mockResolvedValue(JSON.stringify({
                summary: { overallQuality: 'good', message: 'ok' },
                findings: [
                    { category: 'bug', severity: 'warning', title: 'A bug', description: 'd', location: { fileName: 't.ts', startLine: 1, endLine: 1, snippet: '' } },
                    { category: 'style', severity: 'info', title: 'Style', description: 'd', location: { fileName: 't.ts', startLine: 2, endLine: 2, snippet: '' } },
                ],
            })),
        };
        const context: any = { gatherContext: jest.fn().mockResolvedValue({ similarCode: [], namingConventions: {}, commonPatterns: [] }) };
        const service = new ReviewService(llm, context, {
            enabledCategories: [], minSeverity: SeverityLevel.Info, includeContext: false, maxFindings: 10, autoApplyFixes: false,
        } as any);

        const report = await service.reviewCode([], { enabledCategories: [], minSeverity: SeverityLevel.Info, includeContext: false });

        expect(report.findings.map(f => f.title)).toEqual(['A bug', 'Style']);
    });
});

describe('orbit.decisionJournal.enabled', () => {
    const structured = { what: ['x'], why: 'y', improvements: '', tradeoffs: '', production: '' };

    it('records decisions when enabled', () => {
        const db: any = { insert: jest.fn().mockReturnValue(true) };
        const journal = new DecisionJournal(db, () => true);
        expect(journal.saveDecision('p', 'a.ts', 'fix', structured)).not.toBeNull();
        expect(db.insert).toHaveBeenCalled();
    });

    it('records nothing when disabled', () => {
        const db: any = { insert: jest.fn().mockReturnValue(true) };
        const journal = new DecisionJournal(db, () => false);
        expect(journal.saveDecision('p', 'a.ts', 'fix', structured)).toBeNull();
        expect(journal.recordManualDecision({ project_id: 'p', file_path: 'a.ts' })).toBeNull();
        expect(db.insert).not.toHaveBeenCalled();
    });
});
