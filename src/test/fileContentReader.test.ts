import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { FileContentReader } from '../fileReference/fileContentReader';

suite('FileContentReader Test Suite', () => {
    let reader: FileContentReader;
    const testFilePath = path.join(__dirname, 'temp_test_file.txt');

    setup(() => {
        reader = new FileContentReader();
        fs.writeFileSync(testFilePath, 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
    });

    teardown(() => {
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    });

    test('Reads full file', async () => {
        const result = await reader.read(testFilePath);
        assert.strictEqual(result.content, 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
    });

    test('Reads specific lines', async () => {
        const result = await reader.read(testFilePath, {
            lineRange: { start: 2, end: 4 }
        });
        assert.strictEqual(result.content, 'Line 2\nLine 3\nLine 4');
    });

    test('Reads single line', async () => {
        const result = await reader.read(testFilePath, {
            lineRange: { start: 3, end: 3 }
        });
        assert.strictEqual(result.content, 'Line 3');
    });

    test('Throws on file too large', async () => {
        // Write large file
        const largePath = path.join(__dirname, 'large_file.txt');
        const buffer = Buffer.alloc(1024 * 600, 'a'); // 600KB
        fs.writeFileSync(largePath, buffer);

        try {
            await reader.read(largePath, { maxSize: 1024 * 500 });
            assert.fail('Should have thrown error');
        } catch (e: any) {
            assert.ok(e.message.includes('File is too large'));
        } finally {
            fs.unlinkSync(largePath);
        }
    });
});
