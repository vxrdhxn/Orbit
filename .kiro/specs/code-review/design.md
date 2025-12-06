# Code Review Feature Design

## Overview

The code review feature adds AI-powered code analysis capabilities to DevMind, enabling developers to receive automated feedback on code quality, potential bugs, security issues, and best practices. The feature integrates seamlessly with the existing DevMind architecture, leveraging the local Ollama instance for analysis and the existing chat interface for presenting results.

Key design principles:
- **Privacy-first**: All analysis runs locally through Ollama
- **Context-aware**: Leverages existing codebase indexing for project-specific insights
- **Interactive**: Results displayed in chat interface with follow-up capabilities
- **Actionable**: Provides specific suggestions and quick-fix options
- **Performant**: Optimized prompts and concurrent processing for speed

## Architecture

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     VS Code Extension                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐         ┌─────────────────┐              │
│  │   Commands   │────────▶│  ReviewCommand  │              │
│  │  - Context   │         │   Controller    │              │
│  │    Menu      │         └────────┬────────┘              │
│  │  - Palette   │                  │                        │
│  └──────────────┘                  │                        │
│                                     ▼                        │
│                          ┌──────────────────┐               │
│                          │  ReviewService   │               │
│                          │  - Orchestrates  │               │
│                          │  - Builds prompt │               │
│                          │  - Parses result │               │
│                          └────┬────────┬────┘               │
│                               │        │                     │
│                    ┌──────────┘        └──────────┐         │
│                    ▼                               ▼         │
│         ┌──────────────────┐           ┌─────────────────┐  │
│         │  Context         │           │  Ollama Client  │  │
│         │  Gatherer        │           │  (existing)     │  │
│         │  - Index query   │           └─────────────────┘  │
│         │  - File content  │                    │           │
│         └──────────────────┘                    │           │
│                    │                             │           │
│                    ▼                             ▼           │
│         ┌──────────────────┐           ┌─────────────────┐  │
│         │  SimpleIndex     │           │  Local Ollama   │  │
│         │  (existing)      │           │  Instance       │  │
│         └──────────────────┘           └─────────────────┘  │
│                                                 │             │
│                                                 ▼             │
│                                      ┌─────────────────┐     │
│                                      │  ChatProvider   │     │
│                                      │  (existing)     │     │
│                                      │  - Display      │     │
│                                      │  - Interaction  │     │
│                                      └─────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Integration Points

1. **Command Registration**: New commands registered in `extension.ts` activation
2. **Chat Interface**: Results displayed through existing `ChatProvider`
3. **Ollama Client**: Reuses existing `generate()` function for LLM calls
4. **Indexer**: Queries existing `SimpleIndex` for project context
5. **Configuration**: Extends existing settings with review-specific options

## Components and Interfaces

### 1. ReviewCommand Module (`reviewCommand.ts`)

Entry point for triggering code reviews from various sources.

```typescript
export async function runReviewCommand(
  scope: ReviewScope,
  context: vscode.ExtensionContext
): Promise<void>;

export enum ReviewScope {
  Selection = 'selection',
  CurrentFile = 'currentFile',
  OpenFiles = 'openFiles'
}
```

**Responsibilities:**
- Handle command invocation from context menu, palette, or programmatic calls
- Determine review scope (selection, file, multiple files)
- Validate preconditions (file open, Ollama available)
- Delegate to ReviewService for execution
- Show progress indicators

### 2. ReviewService Module (`reviewService.ts`)

Core orchestration logic for code review analysis.

```typescript
export class ReviewService {
  constructor(
    private contextGatherer: ContextGatherer,
    private ollamaClient: OllamaClient,
    private config: ReviewConfig
  );

  async reviewCode(
    code: CodeInput[],
    options: ReviewOptions
  ): Promise<ReviewReport>;

  private buildPrompt(
    code: CodeInput[],
    context: ProjectContext
  ): string;

  private parseResponse(
    response: string
  ): ReviewReport;
}

interface CodeInput {
  content: string;
  fileName: string;
  language: string;
  startLine?: number;
  endLine?: number;
}

interface ReviewOptions {
  enabledCategories: FindingCategory[];
  minSeverity: SeverityLevel;
  includeContext: boolean;
  maxFindings?: number;
}
```

**Responsibilities:**
- Gather project context from indexer
- Build optimized prompts for Ollama
- Execute LLM analysis with streaming support
- Parse structured response into ReviewReport
- Handle errors and timeouts

### 3. ContextGatherer Module (`reviewContext.ts`)

Collects relevant project context for analysis.

```typescript
export class ContextGatherer {
  constructor(private index: SimpleIndex);

  async gatherContext(
    code: CodeInput[],
    options: ContextOptions
  ): Promise<ProjectContext>;

  private async findSimilarPatterns(
    code: string
  ): Promise<CodePattern[]>;

  private async detectNamingConventions(): Promise<NamingRules>;
}

interface ProjectContext {
  similarCode: CodePattern[];
  namingConventions: NamingRules;
  commonPatterns: string[];
  projectType?: string;
}

interface CodePattern {
  file: string;
  snippet: string;
  similarity: number;
}
```

**Responsibilities:**
- Query semantic index for similar code
- Detect project-wide patterns and conventions
- Identify common idioms and practices
- Provide context for consistency checking

### 4. ReviewReport Module (`reviewTypes.ts`)

Data structures for review results.

```typescript
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
```

### 5. ReviewFormatter Module (`reviewFormatter.ts`)

Formats review results for display in chat interface.

```typescript
export class ReviewFormatter {
  formatReport(report: ReviewReport): string;
  
  private formatSummary(summary: ReviewSummary): string;
  
  private formatFinding(
    finding: Finding,
    index: number
  ): string;
  
  private formatSuggestedFix(fix: SuggestedFix): string;
}
```

**Responsibilities:**
- Convert ReviewReport to markdown for chat display
- Add syntax highlighting and formatting
- Create collapsible sections for findings
- Generate clickable links to code locations
- Format suggested fixes with diff previews

### 6. FixApplicator Module (`reviewFixes.ts`)

Applies suggested fixes to code.

```typescript
export class FixApplicator {
  async applyFix(
    finding: Finding,
    fix: SuggestedFix
  ): Promise<ApplyResult>;

  async applyMultipleFixes(
    fixes: Array<{ finding: Finding; fix: SuggestedFix }>
  ): Promise<BatchApplyResult>;

  private async showDiffPreview(
    fileName: string,
    original: string,
    fixed: string
  ): Promise<boolean>;
}

interface ApplyResult {
  success: boolean;
  error?: string;
  appliedChanges?: vscode.TextEdit[];
}
```

**Responsibilities:**
- Generate text edits from suggested fixes
- Show diff preview before applying
- Handle conflicts and validation
- Support batch application of fixes

## Data Models

### Configuration Schema

Extends existing VS Code settings:

```json
{
  "offlineDevAssistant.review.enabledCategories": {
    "type": "array",
    "default": ["bug", "security", "performance", "style", "maintainability", "bestPractice"],
    "description": "Categories of issues to check during code review"
  },
  "offlineDevAssistant.review.minSeverity": {
    "type": "string",
    "enum": ["critical", "warning", "info", "suggestion"],
    "default": "info",
    "description": "Minimum severity level to display"
  },
  "offlineDevAssistant.review.includeContext": {
    "type": "boolean",
    "default": true,
    "description": "Include project context from codebase index"
  },
  "offlineDevAssistant.review.maxFindings": {
    "type": "number",
    "default": 50,
    "description": "Maximum number of findings to report"
  },
  "offlineDevAssistant.review.autoApplyFixes": {
    "type": "boolean",
    "default": false,
    "description": "Automatically apply safe fixes without confirmation"
  }
}
```

### Prompt Template Structure

The prompt sent to Ollama follows this structure:

```
SYSTEM CONTEXT:
You are an expert code reviewer analyzing code for quality, bugs, security, and best practices.

PROJECT CONTEXT:
[If available from index]
- Project type: {detected type}
- Common patterns: {patterns from similar code}
- Naming conventions: {detected conventions}

CODE TO REVIEW:
File: {fileName}
Language: {language}
Lines {startLine}-{endLine}:
```
{code}
```

INSTRUCTIONS:
Analyze the code and provide findings in the following JSON format:
{
  "summary": {
    "overallQuality": "excellent|good|needsImprovement|criticalIssues",
    "message": "Brief overall assessment"
  },
  "findings": [
    {
      "category": "bug|security|performance|style|maintainability|bestPractice",
      "severity": "critical|warning|info|suggestion",
      "title": "Short title",
      "description": "Detailed explanation",
      "line": line_number,
      "suggestedFix": {
        "description": "What to change",
        "code": "Fixed code snippet"
      }
    }
  ]
}

Focus on:
- Potential bugs and logic errors
- Security vulnerabilities
- Performance issues
- Code smells and maintainability
- Adherence to best practices
- Consistency with project patterns

Provide specific, actionable feedback with code examples where possible.
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property Reflection

After analyzing all acceptance criteria, I identified several redundant properties that can be consolidated:
- Properties 5.1, 5.2, and 5.4 all verify localhost-only communication - combined into Property 1
- Properties 3.1, 3.2, and 3.3 all verify finding structure - combined into Property 2
- Properties 10.1, 10.2, and 10.3 all verify summary structure - combined into Property 8
- Properties 1.2 and 1.3 test complementary scope behaviors - combined into Property 3

Property 1: Localhost-only communication
*For any* code review request, all network calls to Ollama SHALL use localhost URLs (127.0.0.1 or localhost) and SHALL NOT make any external network requests
**Validates: Requirements 5.1, 5.2, 5.4**

Property 2: Finding structure validity
*For any* finding in a review report, the finding SHALL have a valid category from the defined set, a valid severity level, a non-empty description, and a code location with line numbers
**Validates: Requirements 2.5, 3.1, 3.2, 3.3**

Property 3: Scope selection correctness
*For any* review invocation, if code is selected then only the selected region SHALL be analyzed, and if no selection exists then the entire active file SHALL be analyzed
**Validates: Requirements 1.2, 1.3**

Property 4: Finding severity ordering
*For any* review report with multiple findings, the findings SHALL be ordered by severity level with critical findings appearing before warnings, warnings before info, and info before suggestions
**Validates: Requirements 3.4**

Property 5: Fix structure validity
*For any* finding that includes a suggested fix, the fix SHALL contain both a description field and a code field, both non-empty
**Validates: Requirements 3.5**

Property 6: Formatted output contains markdown
*For any* review report, the formatted output SHALL contain markdown syntax for code blocks and collapsible sections
**Validates: Requirements 4.2**

Property 7: Configuration model usage
*For any* review request, the model name sent to Ollama SHALL match the configured model in VS Code settings
**Validates: Requirements 5.5**

Property 8: Summary structure validity
*For any* review report, the report SHALL contain a summary section with counts by severity level and an overall quality assessment from the valid set (excellent, good, needsImprovement, criticalIssues)
**Validates: Requirements 10.1, 10.2, 10.3**

Property 9: Configuration filtering
*For any* review with a configured minimum severity threshold, all findings in the report SHALL have severity greater than or equal to the threshold
**Validates: Requirements 6.3**

Property 10: Configuration hot-reload
*For any* configuration change, subsequent review requests SHALL use the updated configuration values without requiring extension restart
**Validates: Requirements 6.5**

Property 11: Index integration
*For any* review request when the codebase index is available, the context gathering phase SHALL query the index for relevant context
**Validates: Requirements 7.1**

Property 12: Graceful index degradation
*For any* review request when the codebase index is unavailable, the review SHALL proceed using only the provided code without failing
**Validates: Requirements 7.5**

Property 13: Fix application correctness
*For any* approved fix, the text edits applied to the document SHALL match the suggested fix code at the specified location
**Validates: Requirements 8.3**

Property 14: Batch fix application
*For any* set of multiple fixes, the system SHALL support applying all fixes in a single operation
**Validates: Requirements 8.4**

Property 15: Multi-file concurrent processing
*For any* review of multiple files, the system SHALL process files concurrently rather than sequentially
**Validates: Requirements 9.2**

Property 16: Large file handling
*For any* file exceeding 2000 lines, the system SHALL either offer to review in sections or automatically section the file
**Validates: Requirements 9.4**

Property 17: Cancellation cleanup
*For any* review cancellation, the system SHALL abort the Ollama request and release all associated resources
**Validates: Requirements 9.5**

Property 18: Multi-file summary structure
*For any* review of multiple files, the report SHALL contain both per-file summaries and an overall summary
**Validates: Requirements 10.5**

Property 19: Multiple file input handling
*For any* review request with multiple open files, the system SHALL accept and process all files in a single operation
**Validates: Requirements 1.5**

Property 20: Action buttons for fixes
*For any* formatted finding that includes a suggested fix, the formatted output SHALL include an "Apply Fix" action button
**Validates: Requirements 8.1**

Property 21: Category filtering
*For any* review with disabled categories in configuration, findings SHALL NOT include any findings from disabled categories
**Validates: Requirements 6.2**

## Error Handling

### Error Categories and Responses

1. **Ollama Unavailable**
   - Detection: Connection refused or timeout on health check
   - Response: Display error message with instructions to start Ollama
   - User Action: Start Ollama service and retry
   - No fallback: Cannot proceed without Ollama

2. **Model Not Found**
   - Detection: Ollama returns model not found error
   - Response: Display error with `ollama pull <model>` command
   - User Action: Pull the required model
   - Fallback: Suggest using a different available model

3. **Invalid Code Input**
   - Detection: Empty selection, no active file, or invalid file type
   - Response: Show warning message explaining the issue
   - User Action: Open a valid file or make a selection
   - Prevention: Disable commands when preconditions not met

4. **Index Unavailable**
   - Detection: Index file missing or corrupted
   - Response: Log warning, proceed without context
   - User Action: None required (graceful degradation)
   - Fallback: Review code without project context

5. **Parse Error**
   - Detection: LLM response not in expected JSON format
   - Response: Attempt best-effort parsing, show raw response if fails
   - User Action: Review raw output or retry
   - Fallback: Display unstructured response

6. **Timeout**
   - Detection: Review exceeds configured timeout (default 60s)
   - Response: Cancel request, show partial results if any
   - User Action: Retry with smaller scope or adjust timeout
   - Fallback: Offer to review in smaller chunks

7. **File Modification Conflict**
   - Detection: File changed between review and fix application
   - Response: Show warning, display current diff
   - User Action: Review changes and decide to apply or cancel
   - Prevention: Check file version before applying fixes

8. **Concurrent Review Limit**
   - Detection: Multiple reviews running simultaneously
   - Response: Queue new request or show busy indicator
   - User Action: Wait for current review to complete
   - Limit: Maximum 3 concurrent reviews

### Error Recovery Strategies

- **Retry with Backoff**: For transient Ollama connection issues
- **Graceful Degradation**: Proceed without optional features (context, fixes)
- **Partial Results**: Return findings discovered before error
- **User Guidance**: Provide clear next steps in error messages
- **Logging**: Record errors for debugging without exposing to user

## Testing Strategy

### Unit Testing

Unit tests will verify specific behaviors and edge cases:

1. **Scope Detection Tests**
   - Test selection vs. full file detection
   - Test empty selection handling
   - Test multi-file scope handling

2. **Configuration Tests**
   - Test config reading and defaults
   - Test category filtering
   - Test severity threshold filtering

3. **Parsing Tests**
   - Test JSON response parsing
   - Test malformed response handling
   - Test empty findings handling

4. **Formatting Tests**
   - Test markdown generation
   - Test syntax highlighting insertion
   - Test collapsible section creation

5. **Context Gathering Tests**
   - Test index query construction
   - Test pattern detection
   - Test graceful handling of missing index

### Property-Based Testing

Property-based tests will verify universal properties across many inputs using a PBT library. We will use **fast-check** for TypeScript property-based testing, configured to run a minimum of 100 iterations per property.

Each property test will be tagged with a comment explicitly referencing the correctness property from this design document using the format: `**Feature: code-review, Property {number}: {property_text}**`

1. **Property 1: Localhost-only communication**
   - Generate: Random code inputs and review options
   - Verify: All Ollama calls use localhost URLs
   - Check: No external network requests made

2. **Property 2: Finding structure validity**
   - Generate: Random review reports with findings
   - Verify: Each finding has valid category, severity, description, and location
   - Check: All required fields present and valid

3. **Property 3: Scope selection correctness**
   - Generate: Random selections and file contents
   - Verify: Analysis input matches selection or full file appropriately
   - Check: Boundaries are correct

4. **Property 4: Finding severity ordering**
   - Generate: Random findings with mixed severities
   - Verify: Output is sorted by severity (critical > warning > info > suggestion)
   - Check: Order is maintained

5. **Property 5: Fix structure validity**
   - Generate: Random findings with fixes
   - Verify: Each fix has description and code fields
   - Check: Fields are non-empty

6. **Property 6: Formatted output contains markdown**
   - Generate: Random review reports
   - Verify: Formatted output contains markdown syntax
   - Check: Code blocks and collapsible sections present

7. **Property 7: Configuration model usage**
   - Generate: Random model configurations
   - Verify: Ollama request uses configured model
   - Check: Model name matches config

8. **Property 8: Summary structure validity**
   - Generate: Random review reports
   - Verify: Summary has counts by severity and quality assessment
   - Check: All required summary fields present

9. **Property 9: Configuration filtering**
   - Generate: Random findings and severity thresholds
   - Verify: Filtered findings meet threshold
   - Check: No findings below threshold

10. **Property 10: Configuration hot-reload**
    - Generate: Random config changes
    - Verify: Next review uses new config
    - Check: No restart required

11. **Property 11: Index integration**
    - Generate: Random code inputs with available index
    - Verify: Index query is called
    - Check: Context gathering uses index

12. **Property 12: Graceful index degradation**
    - Generate: Random code inputs with unavailable index
    - Verify: Review completes without error
    - Check: No index-related failures

13. **Property 13: Fix application correctness**
    - Generate: Random fixes and file contents
    - Verify: Applied edits match suggested fix
    - Check: Location and content correct

14. **Property 14: Batch fix application**
    - Generate: Random sets of multiple fixes
    - Verify: All fixes can be applied together
    - Check: Batch operation succeeds

15. **Property 15: Multi-file concurrent processing**
    - Generate: Random sets of multiple files
    - Verify: Files processed concurrently
    - Check: Concurrent execution detected

16. **Property 16: Large file handling**
    - Generate: Files exceeding 2000 lines
    - Verify: Sectioning offered or applied
    - Check: Large file handling triggered

17. **Property 17: Cancellation cleanup**
    - Generate: Random review requests
    - Verify: Cancellation aborts and cleans up
    - Check: Resources released

18. **Property 18: Multi-file summary structure**
    - Generate: Random multi-file reviews
    - Verify: Per-file and overall summaries present
    - Check: Summary structure correct

19. **Property 19: Multiple file input handling**
    - Generate: Random sets of open files
    - Verify: All files accepted and processed
    - Check: Multi-file input works

20. **Property 20: Action buttons for fixes**
    - Generate: Random findings with fixes
    - Verify: Formatted output includes action buttons
    - Check: Button markup present

21. **Property 21: Category filtering**
    - Generate: Random findings and disabled categories
    - Verify: No findings from disabled categories
    - Check: Category filter applied

### Integration Testing

Integration tests will verify component interactions:

1. **End-to-End Review Flow**
   - Trigger review command
   - Verify Ollama call
   - Verify result display in chat

2. **Fix Application Flow**
   - Generate review with fixes
   - Apply fix
   - Verify file modification

3. **Context Integration**
   - Review with index available
   - Verify context included in prompt
   - Verify relevant patterns found

4. **Configuration Integration**
   - Change settings
   - Run review
   - Verify settings applied

### Testing Approach

- **Implementation-first development**: Implement features before writing corresponding tests
- **Unit tests**: Focus on core logic and edge cases
- **Property tests**: Verify universal properties across many inputs
- **Integration tests**: Verify component interactions
- **Manual testing**: UI interactions and user experience

## Implementation Notes

### Performance Optimizations

1. **Prompt Engineering**
   - Keep prompts concise to reduce token count
   - Use structured output format (JSON) for reliable parsing
   - Include only relevant context from index

2. **Concurrent Processing**
   - Process multiple files in parallel
   - Use Promise.all for concurrent Ollama calls
   - Limit concurrency to avoid overwhelming Ollama

3. **Caching**
   - Cache index queries for similar code patterns
   - Cache configuration reads
   - Reuse context for multiple files in same review

4. **Streaming**
   - Use streaming responses from Ollama
   - Display findings as they arrive
   - Allow early cancellation

### Security Considerations

1. **Input Validation**
   - Sanitize file paths to prevent directory traversal
   - Validate line numbers are within file bounds
   - Limit file size to prevent memory issues

2. **Output Sanitization**
   - Escape markdown in code snippets
   - Validate JSON structure before parsing
   - Prevent code injection in suggested fixes

3. **Privacy**
   - All processing local (no external calls)
   - No telemetry or logging of code content
   - Clear documentation of data flow

### Extensibility Points

1. **Custom Rules**
   - Allow users to define custom review rules
   - Support rule templates for common patterns
   - Enable/disable rules per project

2. **Language-Specific Analysis**
   - Detect language from file extension
   - Apply language-specific prompts
   - Support language-specific fix patterns

3. **Integration Hooks**
   - Pre-review hooks for custom preprocessing
   - Post-review hooks for custom actions
   - Custom formatters for different output styles

4. **Model Selection**
   - Allow per-review model override
   - Support specialized models for specific tasks
   - Fallback to default model if specialized unavailable
