import { FileContext, ImportGraph } from './types';

export class ContextPrioritizer {
    /**
     * Calculates priority scores for a set of files.
     * Score = (isCurrentFile ? 100 : 0) + (hasSelection ? 50 : 0) + (isImported ? 20 : 0) + (isOpen ? 10 : 0)
     */
    public prioritize(
        files: FileContext[],
        currentFilePath?: string,
        hasSelection: boolean = false,
        importGraph?: ImportGraph
    ): FileContext[] {
        return files.map(file => {
            let priority = 0;

            if (file.path === currentFilePath) {
                priority += 100;
                if (hasSelection) priority += 50;
            }

            if (importGraph && currentFilePath) {
                const imports = importGraph.imports.get(currentFilePath) || [];
                if (imports.includes(file.path)) {
                    priority += 20;
                }

                const exports = importGraph.exports.get(currentFilePath) || [];
                if (exports.includes(file.path)) {
                    priority += 15; // Slightly lower for files that import current file
                }
            }

            priority += 10; // Base score for being an open file

            return { ...file, priority };
        }).sort((a, b) => b.priority - a.priority);
    }
}
