import * as assert from 'assert';
import { extractUnifiedDiff, applyUnifiedDiff } from '../diffUtils';

describe('Edit Command Tests', () => {
    describe('extractUnifiedDiff', () => {
        it('should extract diff from fenced code block', () => {
            const input = `Here is the diff:
\`\`\`diff
--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,1 @@
-old
+new
\`\`\`
Hope this helps.`;
            const expected = `--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,1 @@
-old
+new`;
            assert.strictEqual(extractUnifiedDiff(input), expected);
        });

        it('should extract diff starting with ---', () => {
            const input = `Sure, here it is:
--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,1 @@
-old
+new`;
            const expected = `--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,1 @@
-old
+new`;
            assert.strictEqual(extractUnifiedDiff(input), expected);
        });

        it('should return null if no diff found', () => {
            assert.strictEqual(extractUnifiedDiff('Just some text'), null);
        });
    });

    describe('applyUnifiedDiff', () => {
        it('should apply a simple replacement', () => {
            const original = `line1\nline2\nline3`;
            const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 line1
-line2
+modified
 line3`;
            const expected = `line1\nmodified\nline3`;
            assert.strictEqual(applyUnifiedDiff(original, diff), expected);
        });

        it('should handle additions', () => {
            const original = `line1`;
            const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,2 @@
 line1
+line2`;
            const expected = `line1\nline2`;
            assert.strictEqual(applyUnifiedDiff(original, diff), expected);
        });

        it('should handle deletions', () => {
            const original = `line1\nline2`;
            const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,1 @@
 line1
-line2`;
            const expected = `line1`;
            assert.strictEqual(applyUnifiedDiff(original, diff), expected);
        });

        it('should handle multiple hunks', () => {
            const original = `A\nB\nC\nD\nE`;
            const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,2 @@
-A
+Alpha
 B
@@ -4,2 +4,2 @@
 D
-E
+Echo`;
            const expected = `Alpha\nB\nC\nD\nEcho`;
            assert.strictEqual(applyUnifiedDiff(original, diff), expected);
        });
    });
});
