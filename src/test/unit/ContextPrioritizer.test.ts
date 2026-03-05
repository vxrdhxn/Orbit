import { ContextPrioritizer } from '../../context/ContextPrioritizer';
import { FileContext } from '../../context/types';

describe('ContextPrioritizer', () => {
    let prioritizer: ContextPrioritizer;

    beforeEach(() => {
        prioritizer = new ContextPrioritizer();
    });

    test('should prioritize current file with selection', () => {
        const files: FileContext[] = [
            { path: 'file1.ts', content: '', language: 'ts', lastModified: 0, priority: 0 },
            { path: 'file2.ts', content: '', language: 'ts', lastModified: 0, priority: 0 }
        ];

        const results = prioritizer.prioritize(files, 'file1.ts', true);

        expect(results[0].path).toBe('file1.ts');
        expect(results[0].priority).toBe(160); // 100 (current) + 50 (selection) + 10 (open)
    });

    test('should prioritize imported files', () => {
        const files: FileContext[] = [
            { path: 'main.ts', content: '', language: 'ts', lastModified: 0, priority: 0 },
            { path: 'utils.ts', content: '', language: 'ts', lastModified: 0, priority: 0 }
        ];

        const importGraph = {
            imports: new Map([['main.ts', ['utils.ts']]]),
            exports: new Map([['utils.ts', ['main.ts']]])
        };

        const results = prioritizer.prioritize(files, 'main.ts', false, importGraph);

        const utils = results.find(f => f.path === 'utils.ts');
        expect(utils?.priority).toBe(30); // 20 (imported) + 10 (open)
    });
});
