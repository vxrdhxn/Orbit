import { classifyEditIntent, preserveExistingCode, countLineChanges } from '../../../src/utils/editIntent';
import { echoesRequest } from '../../../src/ChatProvider';

describe('classifyEditIntent', () => {
    for (const msg of [
        "write an print statement which prints ' hello everyone'",
        'add another print statement',
        'append a log line',
        'create a function that sums two numbers',
    ]) {
        it(`treats "${msg}" as adding code`, () => {
            expect(classifyEditIntent(msg)).toBe('add');
        });
    }

    for (const msg of [
        'remove the first print statement',
        'replace the print with a return',
        'fix the bug in this file',
        'rewrite this file in TypeScript',
        'change hello to hi',
    ]) {
        it(`treats "${msg}" as modifying code`, () => {
            expect(classifyEditIntent(msg)).toBe('modify');
        });
    }
});

describe('preserveExistingCode', () => {
    it('keeps existing prints when the model returns only the new one', () => {
        const original = "console.log('Hello, This is Orbit');\nconsole.log('orbit');\n";
        const proposed = "console.log('hello everyone');\n";

        const result = preserveExistingCode(original, proposed);

        expect(result.restoredLines).toBe(2);
        expect(result.content).toBe("console.log('Hello, This is Orbit');\nconsole.log('orbit');\nconsole.log('hello everyone');\n");
    });

    it('leaves a correct full-file proposal untouched', () => {
        const original = "a();\nb();\n";
        const proposed = "a();\nb();\nc();\n";
        expect(preserveExistingCode(original, proposed)).toEqual({ content: proposed, restoredLines: 0 });
    });

    it('does not duplicate lines the model only re-indented', () => {
        const original = 'run();\n';
        const proposed = 'try {\n    run();\n} catch (e) {}\n';
        expect(preserveExistingCode(original, proposed).restoredLines).toBe(0);
    });

    it('counts added and removed lines', () => {
        expect(countLineChanges('a\nb\n', 'a\nb\nc\n')).toEqual({ added: 1, removed: 0 });
    });
});

describe('echoesRequest', () => {
    it('detects the model repeating the request', () => {
        expect(echoesRequest("Write an print statement which prints 'hello everyone'.", "write an print statement which prints ' hello everyone'")).toBe(true);
        expect(echoesRequest("I'll add a print statement at the end of hello.js.", "write an print statement which prints ' hello everyone'")).toBe(false);
    });
});
