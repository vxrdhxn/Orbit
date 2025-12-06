export interface ReviewReport {
    summary: ReviewSummary;
    findings: Finding[];
    metadata: ReviewMetadata;
}

export interface ReviewSummary {
    totalFindings: number;
    bySeverity: Record<SeverityLevel, number>;
    byCategory: Record<FindingCategory, number>;
    overallQuality: QualityLevel;
    message: string;
}

export interface Finding {
    id: string;
    category: FindingCategory;
    severity: SeverityLevel;
    title: string;
    description: string;
    location: CodeLocation;
    suggestedFix?: SuggestedFix;
    references?: string[];
}

export interface CodeLocation {
    fileName: string;
    startLine: number;
    endLine: number;
    snippet: string;
}

export interface SuggestedFix {
    description: string;
    code: string;
    diffPreview?: string;
}

export enum SeverityLevel {
    Critical = 'critical',
    Warning = 'warning',
    Info = 'info',
    Suggestion = 'suggestion'
}

export enum FindingCategory {
    Bug = 'bug',
    Security = 'security',
    Performance = 'performance',
    Style = 'style',
    Maintainability = 'maintainability',
    BestPractice = 'bestPractice'
}

export enum QualityLevel {
    Excellent = 'excellent',
    Good = 'good',
    NeedsImprovement = 'needsImprovement',
    CriticalIssues = 'criticalIssues'
}

export interface ReviewMetadata {
    timestamp: number;
    filesReviewed: string[];
    linesAnalyzed: number;
    durationMs: number;
    modelUsed: string;
}

export interface ReviewConfig {
    enabledCategories: FindingCategory[];
    minSeverity: SeverityLevel;
    includeContext: boolean;
    maxFindings: number;
    autoApplyFixes: boolean;
}

export interface ReviewOptions {
    enabledCategories: FindingCategory[];
    minSeverity: SeverityLevel;
    includeContext: boolean;
    maxFindings?: number;
    timeoutMs?: number;
    promptModifiers?: string[];
}

export enum ReviewScope {
    Selection = 'selection',
    CurrentFile = 'currentFile',
    OpenFiles = 'openFiles'
}

export interface CodeInput {
    content: string;
    fileName: string;
    language: string;
    startLine?: number;
    endLine?: number;
    focusRanges?: { start: number; end: number }[];
}

export interface ProjectContext {
    similarCode: any[]; // refine type later
    namingConventions: any;
    commonPatterns: string[];
    projectType?: string;
}
