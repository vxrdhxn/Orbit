import { HunkParser, PartialDiffApplicator } from '../../src/diffUtils';

describe('Diff Utilities - Phase 4', () => {
    describe('HunkParser', () => {
        it('should parse a simple unified diff into hunks', () => {
            const diff = `
--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,4 @@
 line1
-line2
+line2 modified
 line3
+line4
`;
            const hunks = HunkParser.parse(diff);
            expect(hunks.length).toBe(1);
            expect(hunks[0].oldStart).toBe(1);
            expect(hunks[0].newStart).toBe(1);
            expect(hunks[0].lines.length).toBe(5);
        });

        it('should handle multiple hunks', () => {
            const diff = `
@@ -1,3 +1,3 @@
 context
-old
+new
 context
@@ -10,2 +10,3 @@
 context
+added
`;
            const hunks = HunkParser.parse(diff);
            expect(hunks.length).toBe(2);
            expect(hunks[0].oldStart).toBe(1);
            expect(hunks[1].oldStart).toBe(10);
        });
    });

    describe('PartialDiffApplicator', () => {
        const original = [
            'line1',
            'line2',
            'line3',
            'line4',
            'line5'
        ].join('\n');

        it('should apply all hunks when no IDs specified', () => {
            const diff = `
@@ -2,1 +2,1 @@
-line2
+line2-new
@@ -4,1 +4,2 @@
-line4
+line4-new
+line4-extra
`;
            const hunks = HunkParser.parse(diff);
            const result = PartialDiffApplicator.apply(original, hunks);
            const lines = result.split('\n');
            expect(lines[1]).toBe('line2-new');
            expect(lines[3]).toBe('line4-new');
            expect(lines[4]).toBe('line4-extra');
            expect(lines[5]).toBe('line5');
        });

        it('should apply only selected hunks', () => {
            const diff = `
@@ -2,1 +2,1 @@
-line2
+line2-new
@@ -4,1 +4,1 @@
-line4
+line4-new
`;
            const hunks = HunkParser.parse(diff);
            const hunk1Id = hunks[0].id;

            // Apply only the first hunk
            const result = PartialDiffApplicator.apply(original, hunks, [hunk1Id]);
            const lines = result.split('\n');
            expect(lines[1]).toBe('line2-new'); // applied
            expect(lines[3]).toBe('line4');     // NOT applied
        });

        it('should preserve original when no hunks selected', () => {
            const diff = `
@@ -1,2 +1,2 @@
-line1
+line1-new
`;
            const hunks = HunkParser.parse(diff);
            const result = PartialDiffApplicator.apply(original, hunks, []);
            expect(result).toBe(original);
        });
    });
});
