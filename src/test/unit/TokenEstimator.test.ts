import { TokenEstimator } from '../../context/TokenEstimator';
import { CollectedContext } from '../../context/types';

describe('TokenEstimator', () => {
    let estimator: TokenEstimator;

    beforeEach(() => {
        estimator = new TokenEstimator();
    });

    test('should estimate tokens correctly (approx 4 chars/token)', () => {
        expect(estimator.estimateTokens('1234')).toBe(1);
        expect(estimator.estimateTokens('12345678')).toBe(2);
    });

    test('should truncate context to stay within limit', () => {
        const context: CollectedContext = {
            openFiles: [
                { path: 'high.ts', content: 'A'.repeat(400), language: 'ts', lastModified: 0, priority: 100 },
                { path: 'low.ts', content: 'B'.repeat(400), language: 'ts', lastModified: 0, priority: 10 }
            ],
            fileStructure: { directories: [], files: [] },
            importRelationships: { imports: new Map(), exports: new Map() },
            pastDecisions: [],
            totalTokens: 0
        };

        // limit to 150 tokens (approx 600 chars)
        // fileStructure and pastDecisions use some tokens
        const truncated = estimator.truncate(context, 150);

        expect(truncated.openFiles.length).toBeLessThan(2);
        expect(truncated.openFiles[0].path).toBe('high.ts');
        expect(truncated.totalTokens).toBeLessThanOrEqual(150);
    });
});
