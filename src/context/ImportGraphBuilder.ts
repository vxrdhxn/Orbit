import * as fs from 'fs';
import * as path from 'path';
import { ImportGraph } from './types';

export class ImportGraphBuilder {
    /**
     * Parses import/require statements from a set of files to build an import graph.
     */
    public buildGraph(files: { path: string, content: string }[]): ImportGraph {
        const imports = new Map<string, string[]>();
        const exports = new Map<string, string[]>();

        for (const file of files) {
            const fileImports = this.extractImports(file.content, file.path);
            imports.set(file.path, fileImports);

            for (const imp of fileImports) {
                const existing = exports.get(imp) || [];
                if (!existing.includes(file.path)) {
                    existing.push(file.path);
                    exports.set(imp, existing);
                }
            }
        }

        return { imports, exports };
    }

    private extractImports(content: string, filePath: string): string[] {
        const results: string[] = [];
        const dir = path.dirname(filePath);

        // ESM imports: import ... from './module'
        const esmRegex = /from\s+['"]([^'"]+)['"]/g;
        let match;
        while ((match = esmRegex.exec(content)) !== null) {
            results.push(this.resolvePath(match[1], dir));
        }

        // CommonJS requires: require('./module')
        const cjsRegex = /require\(['"]([^'"]+)['"]\)/g;
        while ((match = cjsRegex.exec(content)) !== null) {
            results.push(this.resolvePath(match[1], dir));
        }

        return results.filter(p => p !== '');
    }

    private resolvePath(importPath: string, dir: string): string {
        if (importPath.startsWith('.')) {
            return path.resolve(dir, importPath);
        }
        // For now, we only track relative imports within the project
        return '';
    }
}
