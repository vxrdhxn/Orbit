import * as path from 'path';
import * as fs from 'fs';
import { ImportGraphBuilder } from '../../context/ImportGraphBuilder';

jest.mock('fs');

describe('ImportGraphBuilder', () => {
    let builder: ImportGraphBuilder;
    // Use a path that works well on both Windows and POSIX for mocking
    const projectRoot = path.resolve('/project');

    beforeEach(() => {
        builder = new ImportGraphBuilder(projectRoot);
        jest.clearAllMocks();
    });

    test('should resolve relative imports with extensions', () => {
        const filePath = path.join(projectRoot, 'src', 'main.ts');
        const content = "import { x } from './utils'";
        const utilsPath = path.join(projectRoot, 'src', 'utils.ts');

        (fs.existsSync as jest.Mock).mockImplementation((p) => p === utilsPath);
        (fs.statSync as jest.Mock).mockReturnValue({ isFile: () => true, isDirectory: () => false });

        const graph = builder.buildGraph([{ path: filePath, content }]);

        expect(graph.imports.get(filePath)).toContain(utilsPath);
    });

    test('should resolve alias imports (@/)', () => {
        const filePath = path.join(projectRoot, 'src', 'main.ts');
        const content = "import { Button } from '@/components/Button'";
        const buttonPath = path.join(projectRoot, 'src', 'ui', 'components', 'Button.tsx');

        (fs.existsSync as jest.Mock).mockImplementation((p) => p === buttonPath);
        (fs.statSync as jest.Mock).mockReturnValue({ isFile: () => true, isDirectory: () => false });

        const graph = builder.buildGraph([{ path: filePath, content }]);

        expect(graph.imports.get(filePath)).toContain(buttonPath);
    });

    test('should resolve directory index imports', () => {
        const filePath = path.join(projectRoot, 'src', 'main.ts');
        const content = "import { api } from './api'";
        const apiDirPath = path.join(projectRoot, 'src', 'api');
        const indexPath = path.join(projectRoot, 'src', 'api', 'index.ts');

        (fs.existsSync as jest.Mock).mockImplementation((p) => p === apiDirPath || p === indexPath);
        (fs.statSync as jest.Mock).mockImplementation((p) => ({
            isFile: () => p === indexPath,
            isDirectory: () => p === apiDirPath
        }));

        const graph = builder.buildGraph([{ path: filePath, content }]);

        expect(graph.imports.get(filePath)).toContain(indexPath);
    });

    test('should handle multiple imports and de-duplicate', () => {
        const filePath = path.join(projectRoot, 'src', 'main.ts');
        const content = `
            import { a } from './utils';
            const b = require('./utils');
        `;
        const utilsPath = path.join(projectRoot, 'src', 'utils.ts');

        (fs.existsSync as jest.Mock).mockImplementation((p) => p === utilsPath);
        (fs.statSync as jest.Mock).mockReturnValue({ isFile: () => true, isDirectory: () => false });

        const graph = builder.buildGraph([{ path: filePath, content }]);

        expect(graph.imports.get(filePath)).toHaveLength(1);
        expect(graph.imports.get(filePath)).toContain(utilsPath);
    });
});
