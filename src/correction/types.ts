import * as vscode from 'vscode';
import { Finding } from '../reviewTypes';

export enum CorrectionStatus {
    Pending = 'pending',
    Accepted = 'accepted',
    Rejected = 'rejected',
    Applied = 'applied',
    Failed = 'failed'
}

export interface DiffPreview {
    original: string;
    modified: string;
    unified: string;
    startLine: number;
    endLine: number;
}

export interface CorrectionSuggestion extends Finding {
    correctionId: string;
    status: CorrectionStatus;
    diffPreview?: DiffPreview;
    confidence: number;
    applicability: boolean;
    dependencies: string[];
}

export interface AnalysisResult {
    findings: Finding[];
    corrections: CorrectionSuggestion[];
    timestamp: number;
}

export interface AnalysisTrigger {
    type: 'open' | 'save' | 'manual' | 'scheduled';
    scope: 'file' | 'selection' | 'workspace';
}
