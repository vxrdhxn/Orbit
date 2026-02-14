import * as assert from 'assert';
import { rankEntries } from '../searchUtils';
import { IndexEntry } from '../common';

describe('Search Command Tests', () => {
    describe('rankEntries', () => {
        const mockEntries: IndexEntry[] = [
            { id: '1', file: 'a.ts', start: 0, end: 10, text: 'A', vector: [1, 0, 0] },
            { id: '2', file: 'b.ts', start: 0, end: 10, text: 'B', vector: [0, 1, 0] },
            { id: '3', file: 'c.ts', start: 0, end: 10, text: 'C', vector: [0, 0, 1] },
        ];

        it('should rank entries by cosine similarity', () => {
            const queryVector = [1, 0, 0]; // Should match A perfectly
            const results = rankEntries(mockEntries, queryVector, 3);

            assert.strictEqual(results[0].entry.id, '1');
            assert.strictEqual(results[0].score, 1);

            assert.strictEqual(results[1].score, 0);
            assert.strictEqual(results[2].score, 0);
        });

        it('should respect topK', () => {
            const queryVector = [1, 0, 0];
            const results = rankEntries(mockEntries, queryVector, 1);
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].entry.id, '1');
        });

        it('should handle empty entries', () => {
            const results = rankEntries([], [1, 0, 0], 5);
            assert.strictEqual(results.length, 0);
        });
    });
});
