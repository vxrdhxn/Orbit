# Code Review Enhancements Design

## Overview

This design extends the existing DevMind code review feature with three major enhancements:

1. **Inline Code Annotations**: Visual decorations, gutter icons, and CodeLens that display review findings directly in the editor
2. **Review Presets**: Predefined and customizable review configurations optimized for different scenarios (Pre-Commit, Security Audit, Performance, etc.)
3. **Diff-Based Review**: Git-integrated analysis that focuses exclusively on changed lines

These enhancements transform the code review experience from a separate report view to an integrated, context-aware system that provides immediate visual feedback and focuses on what matters most.

**Key Design Principles:**
- **Non-intrusive**: Annotations enhance without overwhelming
- **Context-aware**: Presets and diff analysis adapt to developer workflow
- **Performance-first**: Fast feedback for frequent use
- **Git-native**: Seamless integration with existing git workflows

## Architecture

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     VS Code Extension                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐         ┌──────────────────┐             │
│  │  Review Commands │────────▶│  Preset Selector │             │
│  │  - Diff Review   │         │  - Auto-detect   │             │
│  │  - Full Review   │         │  - User choice   │             │
│  └────────┬─────────┘         └────────┬─────────┘             │
│           │                             │                        │
│           └─────────────┬───────────────┘                        │
│                         ▼                                        │
│              ┌──────────────────────┐                           │
│              │   ReviewService      │                           │
│              │   (existing)         │                           │
│              │   + Preset support   │                           │
│              └──────────┬───────────┘                           │
│                         │                                        │
│           ┌─────────────┼─────────────┐                         │
│           ▼             ▼             ▼                         │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐             │
│  │    Git     │  │ Annotation │  │   Preset     │             │
│  │  Analyzer  │  │  Manager   │  │   Manager    │             │
│  │            │  │            │  │              │             │
│  └─────┬──────┘  └─────┬──────┘  └──────┬───────┘             │
│        │               │                 │                      │
│        ▼               ▼                 ▼                      │
│  ┌──────────┐   ┌─────────────┐  ┌──────────────┐             │
│  │   Git    │   │  Decoration │  │   Storage    │             │
│  │   CLI    │   │  Renderer   │  │   (persist)  │             │
│  └──────────┘   └─────────────┘  └──────────────┘             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Integration with Existing System

The enhancements integrate with the existing code review architecture:

1. **ReviewService Extension**: Add preset parameter to `reviewCode()` method
2. **New GitAnalyzer**: Standalone module for git operations
3. **New AnnotationManager**: Manages decorations and persistence
4. **New PresetManager**: Handles preset configuration and selection
5. **Command Extensions**: New commands for diff-based review and annotation management

## Components and Interfaces

### 1. PresetManager Module (`reviewPresets.ts`)

Manages review preset configurations and selection.

```typescript
export class PresetManager {
  constructor(private context: vscode.ExtensionContext);

  async selectPreset(
    autoDetectContext?: PresetContext
  ): Promise<ReviewPreset>;

  getPreset(name: string): ReviewPreset | undefined;

  async saveCustomPreset(preset: ReviewPreset): Promise<void>;

  private detectOptimalPreset(
    context: PresetContext
  ): string;
}

export interface ReviewPreset {
  name: string;
  displayName: string;
  description: string;
  icon: string;
  config: PresetConfig;
}

export interface PresetConfig {
  enabledCategories: FindingCategory[];
  minSeverity: SeverityLevel;
  maxFindings?: number;
  includeContext: boolean;
  timeoutMs: number;
  promptModifiers: string[];
}

export interface PresetContext {
  isDiffReview: boolean;
  fileType?: string;
  hasSecurityPatterns?: boolean;
  hasPerformanceCriticalCode?: boolean;
  isRefactoring?: boolean;
}

// Built-in presets
export const PRESETS: Record<string, ReviewPreset> = {
  quickCheck: {
    name: 'quickCheck',
    displayName: 'Quick Check',
    description: 'Fast review focusing on critical issues',
    icon: '⚡',
    config: {
      enabledCategories: ['bug', 'security'],
      minSeverity: SeverityLevel.Warning,
      maxFindings: 20,
      includeContext: false,
      timeoutMs: 10000,
      promptModifiers: ['concise', 'critical-only']
    }
  },
  preCommit: {
    name: 'preCommit',
    displayName: 'Pre-Commit',
    description: 'Ultra-fast critical issues only',
    icon: '🚀',
    config: {
      enabledCategories: ['bug', 'security'],
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
      enabledCategories: ['bug', 'security', 'performance', 'style', 'maintainability', 'bestPractice'],
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
      enabledCategories: ['maintainability', 'bestPractice', 'performance'],
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
      enabledCategories: ['security'],
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
      enabledCategories: ['performance'],
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
      enabledCategories: ['bug', 'security', 'performance', 'style', 'maintainability', 'bestPractice'],
      minSeverity: SeverityLevel.Info,
      includeContext: true,
      timeoutMs: 60000,
      promptModifiers: ['educational', 'examples', 'detailed']
    }
  }
};
```

**Responsibilities:**
- Manage built-in and custom presets
- Auto-detect optimal preset based on context
- Provide UI for preset selection
- Persist custom preset configurations

### 2. GitAnalyzer Module (`reviewGit.ts`)

Analyzes git diffs and identifies changed line ranges.

```typescript
export class GitAnalyzer {
  constructor(private workspaceRoot: vscode.Uri);

  async getUncommittedChanges(): Promise<GitDiff[]>;

  async getStagedChanges(): Promise<GitDiff[]>;

  async getBranchChanges(baseBranch: string): Promise<GitDiff[]>;

  async isGitRepository(): Promise<boolean>;

  private async executeGit(args: string[]): Promise<string>;

  private parseDiff(diffOutput: string): GitDiff[];

  private extractContext(
    fileContent: string,
    changedLines: LineRange[]
  ): CodeWithContext[];
}

export interface GitDiff {
  fileName: string;
  status: 'added' | 'modified' | 'deleted';
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffLine[];
}

export interface DiffLine {
  type: 'added' | 'removed' | 'context';
  lineNumber: number;
  content: string;
}

export interface LineRange {
  start: number;
  end: number;
}

export interface CodeWithContext {
  changedLines: LineRange[];
  contextBefore: string[];
  contextAfter: string[];
  fullContext: string;
}
```

**Responsibilities:**
- Execute git commands to get diffs
- Parse git diff output into structured data
- Identify changed line ranges
- Extract surrounding context for analysis
- Handle git errors gracefully

### 3. AnnotationManager Module (`reviewAnnotations.ts`)

Manages editor decorations, gutter icons, and CodeLens.

```typescript
export class AnnotationManager {
  constructor(
    private context: vscode.ExtensionContext,
    private storage: AnnotationStorage
  );

  async annotateFindings(
    document: vscode.TextDocument,
    findings: Finding[]
  ): Promise<void>;

  async clearAnnotations(
    scope: 'all' | 'file' | 'line',
    target?: vscode.TextDocument | number
  ): Promise<void>;

  async hideAnnotations(): Promise<void>;

  async showAnnotations(): Promise<void>;

  async restoreAnnotations(
    document: vscode.TextDocument
  ): Promise<void>;

  private createDecorations(
    findings: Finding[]
  ): Map<SeverityLevel, vscode.DecorationOptions[]>;

  private createHoverContent(
    findings: Finding[]
  ): vscode.MarkdownString;

  private registerCodeLens(
    document: vscode.TextDocument,
    findings: Finding[]
  ): void;
}

export interface AnnotationData {
  fileName: string;
  findings: Finding[];
  timestamp: number;
  reviewId: string;
}

// Decoration types for different severities
const decorationTypes = {
  critical: vscode.window.createTextEditorDecorationType({
    textDecoration: 'wavy underline red',
    gutterIconPath: /* red error icon */,
    gutterIconSize: 'contain'
  }),
  warning: vscode.window.createTextEditorDecorationType({
    textDecoration: 'wavy underline yellow',
    gutterIconPath: /* yellow warning icon */,
    gutterIconSize: 'contain'
  }),
  info: vscode.window.createTextEditorDecorationType({
    textDecoration: 'wavy underline blue',
    gutterIconPath: /* blue info icon */,
    gutterIconSize: 'contain'
  })
};
```

**Responsibilities:**
- Create and apply text decorations
- Render gutter icons
- Generate hover tooltips with finding details
- Provide CodeLens for quick actions
- Handle decoration lifecycle (create, update, remove)
- Coordinate with storage for persistence

### 4. AnnotationStorage Module (`reviewStorage.ts`)

Persists annotation data across sessions.

```typescript
export class AnnotationStorage {
  constructor(private context: vscode.ExtensionContext);

  async saveAnnotations(
    fileName: string,
    findings: Finding[],
    reviewId: string
  ): Promise<void>;

  async loadAnnotations(
    fileName: string
  ): Promise<AnnotationData | undefined>;

  async clearAnnotations(fileName?: string): Promise<void>;

  async cleanStaleAnnotations(maxAgeDays: number): Promise<void>;

  private async invalidateIfModified(
    fileName: string,
    data: AnnotationData
  ): Promise<boolean>;

  private getStorageKey(fileName: string): string;
}
```

**Responsibilities:**
- Store annotation data in workspace storage
- Load annotations on file open
- Invalidate stale or outdated annotations
- Clean up old annotation data
- Handle storage errors gracefully

### 5. ReviewCodeLensProvider Module (`reviewCodeLens.ts`)

Provides CodeLens for reviewed code.

```typescript
export class ReviewCodeLensProvider implements vscode.CodeLensProvider {
  constructor(private annotationManager: AnnotationManager);

  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[];

  resolveCodeLens(
    codeLens: vscode.CodeLens,
    token: vscode.CancellationToken
  ): vscode.CodeLens;

  private createFileHeaderLens(
    document: vscode.TextDocument
  ): vscode.CodeLens[];

  private createFunctionLens(
    document: vscode.TextDocument,
    findings: Finding[]
  ): vscode.CodeLens[];
}
```

**Responsibilities:**
- Provide CodeLens at file and function level
- Show finding counts
- Provide quick actions (Review Again, Clear, Navigate)

### 6. DiffReviewCommand Module (`reviewDiffCommand.ts`)

Entry point for diff-based review commands.

```typescript
export async function reviewUncommittedChanges(
  context: vscode.ExtensionContext
): Promise<void>;

export async function reviewStagedChanges(
  context: vscode.ExtensionContext
): Promise<void>;

export async function reviewBranchChanges(
  context: vscode.ExtensionContext
): Promise<void>;

async function executeDiffReview(
  gitAnalyzer: GitAnalyzer,
  reviewService: ReviewService,
  preset: ReviewPreset,
  diffType: 'uncommitted' | 'staged' | 'branch'
): Promise<void>;
```

**Responsibilities:**
- Handle diff-based review commands
- Coordinate GitAnalyzer and ReviewService
- Apply appropriate preset
- Display results with diff context

## Data Models

### Extended ReviewReport

```typescript
export interface ReviewReport {
  // Existing fields
  summary: ReviewSummary;
  findings: Finding[];
  metadata: ReviewMetadata;
  
  // New fields for enhancements
  preset?: string;
  diffContext?: DiffReviewContext;
}

export interface DiffReviewContext {
  diffType: 'uncommitted' | 'staged' | 'branch';
  baseBranch?: string;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  newIssues: number;
  preExistingIssues: number;
}

export interface Finding {
  // Existing fields
  id: string;
  category: FindingCategory;
  severity: SeverityLevel;
  title: string;
  description: string;
  location: CodeLocation;
  suggestedFix?: SuggestedFix;
  
  // New fields
  isInChangedLine?: boolean; // For diff reviews
  confidence?: number; // 0-1 confidence score
}
```

### Configuration Schema Extensions

```json
{
  "offlineDevAssistant.review.defaultPreset": {
    "type": "string",
    "enum": ["quickCheck", "preCommit", "deepReview", "refactoring", "securityAudit", "performance", "learning"],
    "default": "quickCheck",
    "description": "Default review preset to use"
  },
  "offlineDevAssistant.review.autoSelectPreset": {
    "type": "boolean",
    "default": true,
    "description": "Automatically suggest optimal preset based on context"
  },
  "offlineDevAssistant.review.showAnnotations": {
    "type": "boolean",
    "default": true,
    "description": "Show inline annotations in editor"
  },
  "offlineDevAssistant.review.showGutterIcons": {
    "type": "boolean",
    "default": true,
    "description": "Show gutter icons for findings"
  },
  "offlineDevAssistant.review.showCodeLens": {
    "type": "boolean",
    "default": true,
    "description": "Show CodeLens for reviewed code"
  },
  "offlineDevAssistant.review.annotationMaxAgeDays": {
    "type": "number",
    "default": 7,
    "description": "Maximum age in days before annotations are automatically cleared"
  },
  "offlineDevAssistant.review.diffContextLines": {
    "type": "number",
    "default": 5,
    "description": "Number of context lines to include around changes in diff reviews"
  },
  "offlineDevAssistant.review.customPresets": {
    "type": "array",
    "default": [],
    "description": "User-defined custom review presets"
  }
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified the following consolidations:
- Properties 1.1-1.4 all verify decoration rendering - combined into Property 1
- Properties 2.1-2.3 all verify gutter icon rendering - combined into Property 2
- Properties 5.1-5.3 all verify diff-based review triggers - combined into Property 8
- Properties 9.1-9.2 verify annotation persistence - combined into Property 13

Property 1: Decoration severity mapping
*For any* finding with a severity level, the rendered decoration SHALL use the correct visual style (red wavy for critical, yellow wavy for warning, blue wavy for info/suggestion)
**Validates: Requirements 1.2, 1.3, 1.4**

Property 2: Gutter icon severity mapping
*For any* finding with a severity level, the rendered gutter icon SHALL use the correct icon type (red error for critical, yellow warning for warning, blue info for info/suggestion)
**Validates: Requirements 2.1, 2.2, 2.3**

Property 3: Hover tooltip completeness
*For any* annotated code region, hovering SHALL display a tooltip containing all findings for that line with title, description, and severity
**Validates: Requirements 1.5, 1.10**

Property 4: Fix action availability
*For any* finding that includes a suggested fix, the hover tooltip SHALL include a clickable "Apply Fix" action
**Validates: Requirements 1.6**

Property 5: Decoration removal on edit
*For any* line with decorations, editing that line SHALL remove all decorations for that line
**Validates: Requirements 1.8**

Property 6: CodeLens finding count accuracy
*For any* function or class with findings, the CodeLens SHALL display the correct count of findings within that scope
**Validates: Requirements 2.5**

Property 7: Preset configuration application
*For any* selected preset, the review SHALL apply the preset's configuration including enabled categories, severity threshold, and timeout
**Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

Property 8: Diff-based line filtering
*For any* diff-based review, the analysis SHALL include only lines that appear in the git diff output plus configured context lines
**Validates: Requirements 5.1, 5.2, 5.3**

Property 9: Context inclusion
*For any* changed line in a diff review, the analysis SHALL include the configured number of context lines before and after the change
**Validates: Requirements 6.1**

Property 10: Function context inclusion
*For any* change affecting a function signature, the analysis SHALL include the entire function body
**Validates: Requirements 6.2**

Property 11: New vs pre-existing classification
*For any* finding in a diff review, the finding SHALL be correctly classified as either "Introduced in this change" or "Pre-existing issue" based on whether it's in a changed line
**Validates: Requirements 7.2, 7.3**

Property 12: Diff summary accuracy
*For any* diff-based review report, the summary SHALL show separate accurate counts for new issues versus pre-existing issues
**Validates: Requirements 7.4**

Property 13: Annotation persistence
*For any* file with annotations, closing and reopening the file SHALL restore all annotations from storage
**Validates: Requirements 9.1, 9.2**

Property 14: Annotation invalidation on external modification
*For any* file modified externally, stored annotations for changed lines SHALL be invalidated
**Validates: Requirements 9.4**

Property 15: Stale annotation cleanup
*For any* annotation older than the configured maximum age, the system SHALL automatically remove it from storage
**Validates: Requirements 9.5**

Property 16: Scope-based annotation clearing
*For any* clear annotations command with scope 'file', only annotations in the active file SHALL be removed, and with scope 'all', annotations in all files SHALL be removed
**Validates: Requirements 10.1, 10.2**

Property 17: Diff review performance
*For any* uncommitted changes under 200 lines, the review SHALL complete within 3 seconds
**Validates: Requirements 11.1**

Property 18: Preset auto-detection for diff reviews
*For any* review triggered on uncommitted changes, the system SHALL suggest the "Pre-Commit" preset by default
**Validates: Requirements 12.1**

Property 19: Git repository detection
*For any* workspace without a git repository, diff-based review commands SHALL be disabled and display an error message
**Validates: Requirements 5.4**

Property 20: Empty diff handling
*For any* diff-based review with no changes detected, the system SHALL display a message indicating there are no changes to review
**Validates: Requirements 5.5**

Property 21: Preset display in report
*For any* review using a preset, the report header SHALL display the preset name
**Validates: Requirements 3.10**

Property 22: Custom preset persistence
*For any* custom preset created by the user, the preset SHALL be saved and available for selection in subsequent reviews
**Validates: Requirements 4.2, 4.4**

Property 23: Incremental decoration rendering
*For any* large file with many findings, decorations SHALL be applied incrementally without blocking the UI
**Validates: Requirements 11.3**

Property 24: Concurrent file processing
*For any* diff review with multiple changed files, files SHALL be processed concurrently
**Validates: Requirements 11.4**

## Error Handling

### Error Categories and Responses

1. **Git Not Available**
   - Detection: Git command not found or not in PATH
   - Response: Disable diff-based commands, show setup instructions
   - User Action: Install git or add to PATH
   - Fallback: Full file review still available

2. **Not a Git Repository**
   - Detection: Git command returns "not a git repository"
   - Response: Disable diff-based commands with clear message
   - User Action: Initialize git repository if desired
   - Fallback: Full file review still available

3. **No Changes Detected**
   - Detection: Git diff returns empty output
   - Response: Show friendly message "No changes to review"
   - User Action: Make changes or use full file review
   - Fallback: Offer to run full file review

4. **Git Command Failed**
   - Detection: Git command exits with error code
   - Response: Log error, show user-friendly message
   - User Action: Check git status manually
   - Fallback: Attempt full file review

5. **Annotation Storage Failed**
   - Detection: Exception during storage write/read
   - Response: Log error, continue without persistence
   - User Action: None required (graceful degradation)
   - Fallback: Annotations work but don't persist

6. **Invalid Preset Configuration**
   - Detection: Preset validation fails
   - Response: Show validation error, prevent saving
   - User Action: Fix configuration errors
   - Fallback: Use default preset

7. **Decoration Limit Exceeded**
   - Detection: Too many findings for single file (>1000)
   - Response: Show warning, apply only top N by severity
   - User Action: Review in sections or adjust filters
   - Fallback: Display all in report, annotate subset

8. **File Modified During Review**
   - Detection: Document version changed
   - Response: Invalidate annotations, offer to re-review
   - User Action: Re-run review if desired
   - Prevention: Check document version before applying

## Testing Strategy

### Unit Testing

Unit tests will verify specific behaviors and edge cases:

1. **Preset Tests**
   - Test preset selection logic
   - Test auto-detection algorithms
   - Test custom preset validation
   - Test preset configuration merging

2. **Git Analysis Tests**
   - Test diff parsing for various formats
   - Test line range extraction
   - Test context extraction
   - Test error handling for git failures

3. **Annotation Tests**
   - Test decoration creation for each severity
   - Test hover content generation
   - Test CodeLens generation
   - Test annotation clearing logic

4. **Storage Tests**
   - Test save/load cycle
   - Test invalidation logic
   - Test stale cleanup
   - Test concurrent access

### Property-Based Testing

Property-based tests will verify universal properties across many inputs using **fast-check** for TypeScript, configured to run a minimum of 100 iterations per property.

Each property test will be tagged with: `**Feature: code-review-enhancements, Property {number}: {property_text}**`

1. **Property 1: Decoration severity mapping**
   - Generate: Random findings with various severities
   - Verify: Decoration style matches severity
   - Check: Color and underline type correct

2. **Property 2: Gutter icon severity mapping**
   - Generate: Random findings with various severities
   - Verify: Gutter icon matches severity
   - Check: Icon type correct

3. **Property 3: Hover tooltip completeness**
   - Generate: Random findings for same line
   - Verify: Tooltip contains all findings
   - Check: All required fields present

4. **Property 7: Preset configuration application**
   - Generate: Random preset selections
   - Verify: Review uses preset config
   - Check: Categories, severity, timeout match

5. **Property 8: Diff-based line filtering**
   - Generate: Random diffs and file contents
   - Verify: Only changed lines + context analyzed
   - Check: Line ranges correct

6. **Property 11: New vs pre-existing classification**
   - Generate: Random findings in changed/unchanged lines
   - Verify: Classification matches line status
   - Check: Labels correct

7. **Property 13: Annotation persistence**
   - Generate: Random annotations
   - Verify: Save/load cycle preserves data
   - Check: All findings restored

8. **Property 16: Scope-based annotation clearing**
   - Generate: Random annotation sets across files
   - Verify: Clear scope respected
   - Check: Correct annotations removed

### Integration Testing

Integration tests will verify component interactions:

1. **End-to-End Diff Review**
   - Make git changes
   - Trigger diff review
   - Verify annotations appear
   - Verify diff context included

2. **Preset Selection Flow**
   - Trigger review
   - Select preset
   - Verify configuration applied
   - Verify results match preset

3. **Annotation Lifecycle**
   - Run review
   - Verify annotations appear
   - Close/reopen file
   - Verify annotations restored
   - Clear annotations
   - Verify removed

4. **Git Integration**
   - Test with uncommitted changes
   - Test with staged changes
   - Test with branch comparison
   - Verify error handling

## Implementation Notes

### Performance Optimizations

1. **Lazy Decoration Rendering**
   - Apply decorations only for visible ranges
   - Update decorations on scroll
   - Batch decoration updates

2. **Diff Caching**
   - Cache git diff results for short period
   - Invalidate on file save
   - Reuse for multiple reviews

3. **Incremental Analysis**
   - Process changed files one at a time
   - Show results as they complete
   - Allow early cancellation

4. **Storage Optimization**
   - Compress annotation data
   - Index by file path for fast lookup
   - Batch cleanup operations

### VS Code API Usage

1. **Decorations**
   - Use `TextEditorDecorationType` for underlines
   - Use `DecorationOptions` for ranges and hovers
   - Dispose decorations properly to avoid leaks

2. **CodeLens**
   - Implement `CodeLensProvider` interface
   - Register with `vscode.languages.registerCodeLensProvider`
   - Update on document changes

3. **Git Integration**
   - Use VS Code's built-in git extension API when available
   - Fall back to CLI for advanced operations
   - Handle git extension not installed

4. **Storage**
   - Use `ExtensionContext.workspaceState` for persistence
   - Use `globalState` for user preferences
   - Handle storage quota limits

### Extensibility Points

1. **Custom Presets**
   - JSON schema for preset definition
   - UI for preset creation/editing
   - Import/export presets

2. **Annotation Styles**
   - Configurable colors and styles
   - Theme-aware decorations
   - Custom icons

3. **Git Providers**
   - Abstract git operations
   - Support alternative VCS
   - Custom diff parsers

4. **Preset Auto-Detection**
   - Pluggable detection strategies
   - File pattern matching
   - Project type detection
