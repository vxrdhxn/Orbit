import * as vscode from 'vscode';
import * as path from 'path';
import { CollectedContext, FileContext, SelectionContext, StructureContext } from './types';
import { ImportGraphBuilder } from './ImportGraphBuilder';
import { ContextPrioritizer } from './ContextPrioritizer';
import { TokenEstimator } from './TokenEstimator';
import { DecisionJournal } from '../memory/DecisionJournal';
import { SimpleIndex } from '../store';

export class EnhancedContextCollector {
    private importGraphBuilder: ImportGraphBuilder;
    private prioritizer: ContextPrioritizer;
    private tokenEstimator: TokenEstimator;

    constructor(
        private journal: DecisionJournal,
        private index: SimpleIndex,
        private maxTokens: number = 4000
    ) {
        this.importGraphBuilder = new ImportGraphBuilder();
        this.prioritizer = new ContextPrioritizer();
        this.tokenEstimator = new TokenEstimator();
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

        // 1. Collect open files
        const openFiles: FileContext[] = vscode.workspace.textDocuments
            .filter(doc => !doc.isUntitled)
            .map(doc => ({
                path: doc.fileName,
                content: doc.getText(),
                language: doc.languageId,
                lastModified: Date.now(), // Simplified
                priority: 0
            }));

        // 2. Build import graph
        const importGraph = this.importGraphBuilder.buildGraph(openFiles);

        // 3. Prioritize files
        const prioritizedFiles = this.prioritizer.prioritize(
            openFiles,
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
            totalTokens: 0 // Will be calculated by TokenEstimator
        };

        // 8. Truncate to token limit
        return this.tokenEstimator.truncate(initialContext, this.maxTokens);
    }
}
