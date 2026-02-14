import * as vscode from 'vscode';
import { FindingCategory, SeverityLevel } from './reviewTypes';

export interface PresetConfig {
    enabledCategories: FindingCategory[];
    minSeverity: SeverityLevel;
    maxFindings?: number;
    includeContext: boolean;
    timeoutMs: number;
    promptModifiers: string[];
}

export interface ReviewPreset {
    name: string;
    displayName: string;
    description: string;
    icon: string;
    config: PresetConfig;
}

export interface PresetContext {
    isDiffReview: boolean;
    fileType?: string;
    hasSecurityPatterns?: boolean;
    hasPerformanceCriticalCode?: boolean;
    isRefactoring?: boolean;
}

export const PRESETS: Record<string, ReviewPreset> = {
    quickCheck: {
        name: 'quickCheck',
        displayName: 'Quick Check',
        description: 'Fast review focusing on critical issues',
        icon: '⚡',
        config: {
            enabledCategories: [FindingCategory.Bug, FindingCategory.Security],
            minSeverity: SeverityLevel.Warning,
            maxFindings: 20,
            includeContext: false,
            timeoutMs: 1000, // 10s
            promptModifiers: ['concise', 'critical-only']
        }
    },
    preCommit: {
        name: 'preCommit',
        displayName: 'Pre-Commit',
        description: 'Ultra-fast critical issues only',
        icon: '🚀',
        config: {
            enabledCategories: [FindingCategory.Bug, FindingCategory.Security],
            minSeverity: SeverityLevel.Critical,
            maxFindings: 10,
            includeContext: false,
            timeoutMs: 5000,
            promptModifiers: ['critical-only', 'no-style']
        }
    },
    deepReview: {
        name: 'deepReview',
        displayName: 'Deep Review',
        description: 'Comprehensive analysis of all aspects',
        icon: '🔍',
        config: {
            enabledCategories: Object.values(FindingCategory),
            minSeverity: SeverityLevel.Suggestion,
            includeContext: true,
            timeoutMs: 60000,
            promptModifiers: ['detailed', 'educational']
        }
    },
    refactoring: {
        name: 'refactoring',
        displayName: 'Refactoring',
        description: 'Focus on code structure and maintainability',
        icon: '🔧',
        config: {
            enabledCategories: [FindingCategory.Maintainability, FindingCategory.BestPractice, FindingCategory.Performance],
            minSeverity: SeverityLevel.Info,
            includeContext: true,
            timeoutMs: 30000,
            promptModifiers: ['patterns', 'structure']
        }
    },
    securityAudit: {
        name: 'securityAudit',
        displayName: 'Security Audit',
        description: 'Deep security vulnerability analysis',
        icon: '🔒',
        config: {
            enabledCategories: [FindingCategory.Security],
            minSeverity: SeverityLevel.Info,
            includeContext: true,
            timeoutMs: 45000,
            promptModifiers: ['security-focused', 'detailed']
        }
    },
    performance: {
        name: 'performance',
        displayName: 'Performance',
        description: 'Optimization and efficiency analysis',
        icon: '⚡',
        config: {
            enabledCategories: [FindingCategory.Performance],
            minSeverity: SeverityLevel.Info,
            includeContext: true,
            timeoutMs: 30000,
            promptModifiers: ['performance-focused', 'algorithms']
        }
    },
    learning: {
        name: 'learning',
        displayName: 'Learning Mode',
        description: 'Educational explanations for all findings',
        icon: '📚',
        config: {
            enabledCategories: Object.values(FindingCategory),
            minSeverity: SeverityLevel.Info,
            includeContext: true,
            timeoutMs: 60000,
            promptModifiers: ['educational', 'examples', 'detailed']
        }
    }
};

export class PresetManager {
    constructor(private context: vscode.ExtensionContext) { }

    async selectPreset(autoDetectContext?: PresetContext): Promise<ReviewPreset> {
        // 1. Auto-detect if context provided
        let recommended: ReviewPreset | undefined;
        if (autoDetectContext) {
            const presetName = this.detectOptimalPreset(autoDetectContext);
            recommended = this.getPreset(presetName);
        }

        // 2. Show QuickPick
        const items = Object.values(PRESETS).map(p => ({
            label: `${p.icon} ${p.displayName}`,
            description: p.description,
            detail: recommended?.name === p.name ? '(Recommended)' : undefined,
            preset: p
        }));

        // Move recommended to top
        if (recommended) {
            const idx = items.findIndex(i => i.preset.name === recommended!.name);
            if (idx > -1) {
                const [item] = items.splice(idx, 1);
                items.unshift(item);
            }
        }

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a review preset',
            ignoreFocusOut: true
        });

        // Default to quickCheck if nothing selected (escaped)
        // Or strictly we might return undefined to cancel, but let's default for now
        // to simplify flow, or throw Cancelled.
        // If user escapes, typically we want to cancel the operation.
        if (!selected) {
            throw new Error("Cancelled");
        }

        return selected.preset;
    }

    getPreset(name: string): ReviewPreset | undefined {
        // Check built-ins
        if (PRESETS[name]) return PRESETS[name];
        // Check custom (TODO: persistent storage first)
        return undefined;
    }

    private detectOptimalPreset(ctx: PresetContext): string {
        if (ctx.hasSecurityPatterns) return 'securityAudit';
        if (ctx.hasPerformanceCriticalCode) return 'performance';
        if (ctx.isRefactoring) return 'refactoring';
        if (ctx.isDiffReview) return 'preCommit'; // default for diffs
        return 'quickCheck';
    }
}
