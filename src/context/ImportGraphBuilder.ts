import * as fs from 'fs';
import * as path from 'path';
import { ImportGraph } from './types';

export class ImportGraphBuilder {
    private readonly projectRoot: string;
    private readonly uiSourceRoot: string;

    constructor(projectRoot: string = '') {
        this.projectRoot = projectRoot;
        // Based on vite.config.ts: alias @/ -> src/ui
        this.uiSourceRoot = path.join(this.projectRoot, 'src', 'ui');
    }

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
            const resolved = this.resolvePath(match[1], dir);
            if (resolved) results.push(resolved);
        }

        // CommonJS requires: require('./module')
        const cjsRegex = /require\(['"]([^'"]+)['"]\)/g;
        while ((match = cjsRegex.exec(content)) !== null) {
            const resolved = this.resolvePath(match[1], dir);
            if (resolved) results.push(resolved);
        }

        return [...new Set(results)]; // De-duplicate
    }

    private resolvePath(importPath: string, dir: string): string {
        let absolutePath: string;

        if (importPath.startsWith('@/')) {
            // Handle alias @/ -> src/ui
            absolutePath = path.join(this.uiSourceRoot, importPath.substring(2));
        } else if (importPath.startsWith('.')) {
            // Handle relative imports
            absolutePath = path.resolve(dir, importPath);
        } else {
            // Non-relative imports (node_modules, etc.) are skipped for now
            return '';
        }

        const found = this.findExistingFile(absolutePath);
        return found;
    }

    private findExistingFile(basePath: string): string {
        const extensions = ['.ts', '.tsx', '.js', '.jsx'];

        // 1. Check if the path itself exists (e.g. it already has an extension)
        try {
            if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
                return basePath;
            }
        } catch (e) {
            // Ignore errors from statSync
        }

        // 2. Try adding extensions
        for (const ext of extensions) {
            const fullPath = basePath + ext;
            if (fs.existsSync(fullPath)) {
                return fullPath;
            }
        }

        // 3. Try directory index files
        try {
            if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
                for (const ext of extensions) {
                    const indexPath = path.join(basePath, 'index' + ext);
                    if (fs.existsSync(indexPath)) {
                        return indexPath;
                    }
                }
            }
        } catch (e) {
            // Ignore errors
        }

        return '';
    }
}
