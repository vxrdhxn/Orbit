import { DecisionRecord } from '../memory/types';

export interface FileContext {
    path: string;
    content: string;
    language: string;
    lastModified: number;
    priority: number;
}

export interface SelectionContext {
    file: string;
    content: string;
    startLine: number;
    endLine: number;
}

export interface StructureContext {
    directories: string[];
    files: string[];
    packageInfo?: any;
}

export interface ImportGraph {
    imports: Map<string, string[]>;
    exports: Map<string, string[]>;
}

export interface CollectedContext {
    openFiles: FileContext[];
    currentSelection?: SelectionContext;
    fileStructure: StructureContext;
    importRelationships: ImportGraph;
    pastDecisions: DecisionRecord[];
    totalTokens: number;
}
