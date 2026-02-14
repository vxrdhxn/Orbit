import * as assert from 'assert';
import { chunk } from '../indexerUtils';

describe('Indexer Tests', () => {
    describe('chunk', () => {
        it('should chunk text smaller than maxChars', () => {
            const text = 'Hello world';
            const chunks = chunk(text, 100, 10);
            assert.strictEqual(chunks.length, 1);
            assert.strictEqual(chunks[0].text, 'Hello world');
        });

        it('should split text larger than maxChars', () => {
            const text = 'A'.repeat(150);
            const chunks = chunk(text, 100, 10);
            assert.strictEqual(chunks.length, 2);
            assert.strictEqual(chunks[0].text.length, 100);
            assert.strictEqual(chunks[1].text.length, 60); // 50 remaining + 10 overlap
        });

        it('should respect overlap', () => {
            const text = '1234567890';
            const chunks = chunk(text, 5, 2);
            // Chunk 1: 0-5 "12345"
            // Next start: 5 - 2 = 3
            // Chunk 2: 3-8 "45678"
            // Next start: 8 - 2 = 6
            // Chunk 3: 6-10 "7890"

            assert.strictEqual(chunks.length, 3);
            assert.strictEqual(chunks[0].text, '12345');
            assert.strictEqual(chunks[1].text, '45678');
            assert.strictEqual(chunks[2].text, '7890');
        });

        it('should try to break on blank lines', () => {
            const text = 'Line1\n\nLine2';
            // If maxChars falls in the middle of Line2, it should prefer the blank line
            // Let's say maxChars is just enough to cover Line1\n\n + 1 char of Line2
            // Length of "Line1\n\n" is 7. "Line2" is 5. Total 12.
            // If maxChars = 8.
            // Normal split: "Line1\n\nL"
            // Smart split: "Line1\n\n" (length 7)

            const chunks = chunk(text, 8, 0);
            assert.strictEqual(chunks[0].text, 'Line1\n\n');
            assert.strictEqual(chunks[1].text, 'Line2');
        });
    });
});
