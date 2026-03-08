import * as vscode from 'vscode';
import * as path from 'path';
import { CollectedContext, FileContext, SelectionContext, StructureContext } from './types';
import { ImportGraphBuilder } from './ImportGraphBuilder';
import { ContextPrioritizer } from './ContextPrioritizer';
import { TokenEstimator } from './TokenEstimator';
import { DecisionJournal } from '../memory/DecisionJournal';
import { SimpleIndex } from '../store';
import { FileContentReader } from '../fileReference/fileContentReader';

export class EnhancedContextCollector {
    private importGraphBuilder: ImportGraphBuilder;
    private prioritizer: ContextPrioritizer;
    private tokenEstimator: TokenEstimator;
    private fileReader: FileContentReader;

    constructor(
        private journal: DecisionJournal,
        private index: SimpleIndex,
        private maxTokens: number = 4000
    ) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        this.importGraphBuilder = new ImportGraphBuilder(workspaceRoot);
        this.prioritizer = new ContextPrioritizer();
        this.tokenEstimator = new TokenEstimator();
        this.fileReader = new FileContentReader();
    }

    /**
     * Collects enhanced context from multiple sources.
     */
    public async collectContext(
        operation: string,
        scope: 'file' | 'project' = 'file'
    ): Promise<CollectedContext> {
        const editor = vscode.window.activeTextEditor;
        const currentFile = editor?.document.fileName;
        const selection = editor?.selection;

        // 1. Collect currently open files
        const openFiles: FileContext[] = vscode.workspace.textDocuments
            .filter(doc => !doc.isUntitled)
            .map(doc => ({
                path: doc.fileName,
                content: doc.getText(),
                language: doc.languageId,
                lastModified: Date.now(),
                priority: 0
            }));

        // 2. Build initial import graph and discover dependencies
        let allRelevantFiles = [...openFiles];
        if (currentFile) {
            const dependencies = await this.resolveDependencies(currentFile, openFiles, 2);
            // Merge with open files (ensure no duplicates)
            const openFilePaths = new Set(openFiles.map(f => f.path));
            for (const dep of dependencies) {
                if (!openFilePaths.has(dep.path)) {
                    allRelevantFiles.push(dep);
                }
            }
        }

        const importGraph = this.importGraphBuilder.buildGraph(allRelevantFiles);

        // 3. Prioritize files
        const prioritizedFiles = this.prioritizer.prioritize(
            allRelevantFiles,
            currentFile,
            selection ? !selection.isEmpty : false,
            importGraph
        );

        // 4. Get current selection details
        let selectionContext: SelectionContext | undefined;
        if (editor && selection && !selection.isEmpty) {
            selectionContext = {
                file: currentFile!,
                content: editor.document.getText(selection),
                startLine: selection.start.line,
                endLine: selection.end.line
            };
        }

        // 5. Build file structure context
        const fileStructure: StructureContext = {
            directories: [],
            files: prioritizedFiles.map(f => path.basename(f.path))
        };

        // 6. Gather past decisions from Decision Journal
        const projectId = vscode.workspace.name || 'default';
        const pastDecisions = currentFile
            ? this.journal.getDecisionsForFile(projectId, currentFile, 5)
            : this.journal.getRecentDecisions(projectId, 10);

        // 7. Assemble context
        const initialContext: CollectedContext = {
            openFiles: prioritizedFiles,
            currentSelection: selectionContext,
            fileStructure,
            importRelationships: importGraph,
            pastDecisions,
            totalTokens: 0
        };

        // 8. Truncate to token limit
        return this.tokenEstimator.truncate(initialContext, this.maxTokens);
    }

    /**
     * Recursively resolves dependencies for a file up to a certain depth.
     */
    private async resolveDependencies(
        filePath: string,
        cachedFiles: FileContext[],
        maxDepth: number,
        currentDepth: number = 0,
        visited: Set<string> = new Set()
    ): Promise<FileContext[]> {
        if (currentDepth >= maxDepth || visited.has(filePath)) {
            return [];
        }
        visited.add(filePath);

        const results: FileContext[] = [];
        let content = cachedFiles.find(f => f.path === filePath)?.content;

        if (content === undefined) {
            try {
                const fileData = await this.fileReader.read(filePath);
                content = fileData.content;
                results.push({
                    path: filePath,
                    content: content,
                    language: path.extname(filePath).substring(1),
                    lastModified: Date.now(),
                    priority: 0
                });
            } catch {
                return []; // Skip if file can't be read
            }
        }

        // Extract imports from this file
        // Note: We're calling a private method of ImportGraphBuilder here, 
        // which isn't ideal but we'll accept it for now as part of the refactor.
        // In a real scenario, we might want to expose this or use a separate utility.
        const imports = (this.importGraphBuilder as any).extractImports(content, filePath);

        for (const imp of imports) {
            const depFiles = await this.resolveDependencies(imp, cachedFiles, maxDepth, currentDepth + 1, visited);
            results.push(...depFiles);
        }

        return results;
    }
}
