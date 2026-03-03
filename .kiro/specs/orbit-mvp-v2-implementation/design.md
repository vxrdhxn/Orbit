# Design Document: Orbit MVP v2 Implementation

## Overview

This design specifies the technical architecture for transforming Orbit from a basic AI coding assistant into a reasoning-first AI coding companion. The implementation introduces five core subsystems that work together to enforce structured reasoning across all AI interactions:

1. **Structured Reasoning Engine**: Enforces mandatory 5-section format (what, why, improvements, tradeoffs, production implications) for all AI responses
2. **Enhanced Code Review System**: Generates inline comments with structured reasoning attached to specific code locations
3. **Diff Engine with Approval Flow**: Presents code changes as diffs with explanations and requires explicit user approval
4. **Performance Analyzer**: Analyzes algorithmic complexity and provides optimization suggestions with reasoning
5. **Decision Journal with SQLite Memory**: Persists development decisions and retrieves them as context for future operations

The design maintains backward compatibility with the existing provider architecture (LocalProvider/OnlineProvider) and integrates through existing VS Code extension points without breaking current workflows.

## Architecture

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code Extension                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Structured Reasoning Engine                    │ │
│  │  ┌──────────────────┐      ┌──────────────────────┐       │ │
│  │  │  LLM Router      │─────▶│  Response Formatter  │       │ │
│  │  │  (Intercepts &   │      │  (Validates 5        │       │ │
│  │  │   Transforms)    │      │   sections)          │       │ │
│  │  └──────────────────┘      └──────────────────────┘       │ │
│  └────────────────────────────────────────────────────────────┘ │
│           │                                                       │
│           ▼                                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  Feature Modules                            │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │ │
│  │  │ Code Review  │  │ Diff Engine  │  │  Performance    │  │ │
│  │  │   Engine     │  │              │  │   Analyzer      │  │ │
│  │  └──────────────┘  └──────────────┘  └─────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│           │                          │                           │
│           ▼                          ▼                           │
│  ┌──────────────────┐      ┌──────────────────────────┐        │
│  │ Context          │      │  Decision Journal        │        │
│  │ Collector        │◀─────│  (SQLite Memory)         │        │
│  └──────────────────┘      └──────────────────────────┘        │
│           │                                                       │
│           ▼                                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Provider Layer (Existing)                      │ │
│  │  ┌──────────────────┐         ┌──────────────────┐         │ │
│  │  │  LocalProvider   │         │  OnlineProvider  │         │ │
│  │  │  (Ollama)        │         │  (Cloud API)     │         │ │
│  │  └──────────────────┘         └──────────────────┘         │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```


### Data Flow

1. **User initiates AI operation** (chat, review, edit, performance analysis)
2. **Context Collector** gathers relevant code, file structure, and past decisions from Decision Journal
3. **Provider Layer** (LocalProvider or OnlineProvider) receives request with context
4. **LLM Router** intercepts raw response and transforms it into structured format
5. **Response Formatter** validates that all 5 sections are present
6. **Feature Module** (Review/Diff/Performance) processes structured response and presents to user
7. **Decision Journal** persists approved decisions to SQLite database

### Integration Strategy

The new components integrate with existing code through:

- **Provider Wrapper**: LLM Router wraps existing AIProvider interface without modifying it
- **Extension Points**: New commands register alongside existing commands in extension.ts
- **Decorator Pattern**: Response Formatter decorates existing response handling
- **Event Hooks**: Decision Journal hooks into existing approval events (edit apply, review accept)

## Components and Interfaces

### 1. Structured Reasoning Engine

#### 1.1 Response Formatter

**Purpose**: Validates and formats all AI responses to ensure they contain the mandatory 5-section structure.

**Interface**:
```typescript
interface StructuredResponse {
  what: string;           // What is happening
  why: string;            // Why it works or fails
  improvements: string;   // Potential improvements
  tradeoffs: string;      // Tradeoffs and considerations
  production: string;     // Production implications
  metadata?: {
    model: string;
    timestamp: number;
    tokensUsed?: number;
  };
}

interface ValidationResult {
  valid: boolean;
  missingSections: string[];
  errors: string[];
}

class ResponseFormatter {
  validate(response: any): ValidationResult;
  format(response: StructuredResponse): FormattedOutput;
  renderMarkdown(response: StructuredResponse): string;
  renderWebview(response: StructuredResponse): string;
  extractCodeBlocks(text: string): CodeBlock[];
}
```

**Implementation Details**:
- Schema validation checks for presence of all 5 required fields
- Validation returns specific missing sections for error reporting
- Markdown rendering uses headers (##) for each section
- Webview rendering wraps sections in styled divs with collapsible UI
- Code blocks are preserved with syntax highlighting metadata


#### 1.2 LLM Router

**Purpose**: Intercepts all responses from Provider instances and transforms raw LLM output into structured format.

**Interface**:
```typescript
interface LLMRouterConfig {
  maxRetries: number;
  streamBufferSize: number;
  fallbackToRaw: boolean;
}

class LLMRouter {
  constructor(
    private provider: AIProvider,
    private formatter: ResponseFormatter,
    private config: LLMRouterConfig
  );

  async chat(messages: Message[], context: Context): Promise<StructuredResponse>;
  async explain(code: string, context: Context): Promise<StructuredResponse>;
  async review(code: string, context: Context): Promise<StructuredResponse>;
  async generateDiff(code: string, instruction: string, context: Context): Promise<StructuredResponse>;
  
  private async transformResponse(raw: string, operationType: string): Promise<StructuredResponse>;
  private async requestRegeneration(messages: Message[], reason: string): Promise<string>;
  private bufferStreamingResponse(stream: AsyncIterable<string>): Promise<string>;
}
```

**Implementation Details**:
- Wraps existing AIProvider interface without modifying provider implementations
- Adds structured reasoning instructions to system prompts
- Parses raw output using regex patterns to extract sections
- Falls back to post-processing if LLM doesn't follow structure
- Buffers streaming responses completely before attempting to parse structure
- Retries up to maxRetries times if structure is missing
- If all retries fail and fallbackToRaw is true, displays raw output with warning

**Parsing Strategy**:
1. Look for explicit section markers (e.g., "## What is happening", "**Why:**")
2. Use heuristics to identify section boundaries if markers are missing
3. For LocalProvider (Ollama), apply more aggressive post-processing
4. For OnlineProvider, rely on prompt engineering for better structure compliance


### 2. Enhanced Code Review System

**Purpose**: Generates inline comments with structured reasoning attached to specific code locations.

**Interface**:
```typescript
interface InlineComment {
  id: string;
  line: number;
  category: FindingCategory;
  severity: SeverityLevel;
  reasoning: StructuredResponse;
  suggestedFix?: {
    description: string;
    code: string;
  };
}

interface ReviewResult {
  comments: InlineComment[];
  summary: StructuredResponse;
  metadata: ReviewMetadata;
}

class CodeReviewEngine {
  constructor(
    private router: LLMRouter,
    private formatter: ResponseFormatter
  );

  async reviewCode(code: CodeInput[], options: ReviewOptions): Promise<ReviewResult>;
  async consolidateComments(comments: InlineComment[]): InlineComment[];
  async presentInEditor(comments: InlineComment[], document: vscode.TextDocument): Promise<void>;
}
```

**Implementation Details**:
- Extends existing ReviewService to add structured reasoning
- Each Finding from reviewService.ts is enhanced with StructuredResponse
- Consolidation merges multiple findings on same line into single comment with combined reasoning
- VS Code integration uses Diagnostic API for inline display
- CodeLens provides "View Reasoning" action that expands full structured explanation
- Preserves existing review functionality (categories, severity levels, suggested fixes)

**Consolidation Algorithm**:
```
For each line with multiple findings:
  1. Group findings by line number
  2. Combine "what" sections into bulleted list
  3. Merge "why" sections with finding-specific context
  4. Aggregate "improvements" from all findings
  5. Combine "tradeoffs" with priority ordering
  6. Synthesize "production" implications across all findings
```


### 3. Diff Engine with Approval Flow

**Purpose**: Generates and presents code changes as diffs with structured reasoning and explicit approval workflow.

**Interface**:
```typescript
interface DiffProposal {
  id: string;
  original: string;
  modified: string;
  unifiedDiff: string;
  hunks: DiffHunk[];
  reasoning: StructuredResponse;
  metadata: {
    fileName: string;
    instruction: string;
    timestamp: number;
  };
}

interface DiffHunk {
  id: string;
  header: string;  // @@ -a,b +c,d @@
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
  selected: boolean;
}

interface ApprovalResult {
  approved: boolean;
  appliedHunks: string[];
  finalContent: string;
}

class DiffEngine {
  constructor(
    private router: LLMRouter,
    private formatter: ResponseFormatter,
    private journal: DecisionJournal
  );

  async generateDiff(code: string, instruction: string, context: Context): Promise<DiffProposal>;
  async presentDiff(proposal: DiffProposal): Promise<ApprovalResult>;
  async applyDiff(proposal: DiffProposal, selectedHunks: string[]): Promise<void>;
  async rejectDiff(proposal: DiffProposal): Promise<void>;
  
  private parseHunks(unifiedDiff: string): DiffHunk[];
  private applyPartialDiff(original: string, hunks: DiffHunk[]): string;
}
```

**Implementation Details**:
- Extends existing editCommand.ts and diffUtils.ts
- Generates unified diff using existing applyUnifiedDiff function
- Parses diff into individual hunks for partial approval
- Presents diff in VS Code diff editor with custom webview panel for reasoning
- Webview shows structured reasoning above diff with Accept/Reject/Accept Partial buttons
- Partial approval opens checklist UI for hunk selection
- On approval, logs decision to Decision Journal with full reasoning
- On rejection, discards changes without file modification

**Diff Presentation UI**:
```
┌─────────────────────────────────────────────────────┐
│ Structured Reasoning                                │
│ ┌─────────────────────────────────────────────────┐ │
│ │ What: Converting callback to async/await        │ │
│ │ Why: Improves readability and error handling    │ │
│ │ Improvements: Add timeout handling              │ │
│ │ Tradeoffs: Requires Node 8+                     │ │
│ │ Production: Test error paths thoroughly         │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ [Accept] [Reject] [Accept Partial]                 │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│ Diff View (VS Code native diff editor)             │
│ file.ts (original) ↔ file.ts (proposed)            │
└─────────────────────────────────────────────────────┘
```


### 4. Performance Analyzer Module

**Purpose**: Analyzes algorithmic complexity and provides optimization suggestions with structured reasoning.

**Interface**:
```typescript
interface PerformanceAnalysis {
  timeComplexity: {
    bestCase: string;
    averageCase: string;
    worstCase: string;
    explanation: string;
  };
  spaceComplexity: {
    auxiliary: string;
    total: string;
    explanation: string;
  };
  edgeCases: EdgeCase[];
  optimizations: Optimization[];
  reasoning: StructuredResponse;
}

interface EdgeCase {
  scenario: string;
  impact: string;
  mitigation: string;
}

interface Optimization {
  title: string;
  description: string;
  expectedImprovement: string;
  reasoning: StructuredResponse;
}

class PerformanceAnalyzer {
  constructor(
    private router: LLMRouter,
    private formatter: ResponseFormatter
  );

  async analyzeCode(code: string, language: string, context: Context): Promise<PerformanceAnalysis>;
  async analyzeSelection(editor: vscode.TextEditor): Promise<PerformanceAnalysis>;
  async analyzeCurrentFunction(editor: vscode.TextEditor): Promise<PerformanceAnalysis>;
  
  private extractFunction(document: vscode.TextDocument, position: vscode.Position): string;
  private formatAnalysisOutput(analysis: PerformanceAnalysis): string;
}
```

**Implementation Details**:
- New module that uses LLM Router for analysis
- Prompt engineering focuses on Big-O notation and algorithmic patterns
- Heuristics for common patterns (loops, recursion, data structures)
- Falls back to "uncertain" with reasoning if complexity cannot be determined
- Output panel displays results in structured format
- Supports functions, methods, class definitions, and arbitrary code blocks

**Analysis Prompt Structure**:
```
Analyze the following code for performance characteristics:

[CODE]

Provide analysis in this structure:
1. What is happening: Describe the algorithm and data flow
2. Why it works or fails: Explain complexity characteristics
3. Improvements: Suggest optimizations
4. Tradeoffs: Discuss space/time tradeoffs
5. Production implications: Scalability and edge cases

Include:
- Time complexity (best, average, worst case)
- Space complexity (auxiliary and total)
- Edge cases that cause performance degradation
- Specific optimization suggestions
```


### 5. Decision Journal with SQLite Memory

**Purpose**: Persists development decisions and retrieves them as context for future operations.

**Interface**:
```typescript
interface Decision {
  id: string;
  timestamp: number;
  projectId: string;
  filePath: string;
  changeType: 'edit' | 'review' | 'refactor' | 'optimization';
  description: string;
  reasoning: StructuredResponse;
  approved: boolean;
  metadata?: {
    linesChanged?: number;
    category?: string;
    relatedDecisions?: string[];
  };
}

interface DecisionQuery {
  projectId?: string;
  filePath?: string;
  startDate?: number;
  endDate?: number;
  changeType?: string;
  limit?: number;
}

class DecisionJournal {
  constructor(private storage: SQLiteMemory);

  async saveDecision(decision: Omit<Decision, 'id' | 'timestamp'>): Promise<string>;
  async queryDecisions(query: DecisionQuery): Promise<Decision[]>;
  async getDecision(id: string): Promise<Decision | null>;
  async getRecentDecisions(projectId: string, limit: number): Promise<Decision[]>;
  async getDecisionsForFile(filePath: string): Promise<Decision[]>;
}

class SQLiteMemory {
  constructor(private dbPath: string);

  async initialize(): Promise<void>;
  async insert(table: string, data: any): Promise<string>;
  async query(sql: string, params: any[]): Promise<any[]>;
  async migrate(version: number): Promise<void>;
  
  private createSchema(): Promise<void>;
  private createIndexes(): Promise<void>;
}
```

**Implementation Details**:
- SQLite database stored at `<workspace>/.orbit/decisions.db`
- Database created on first use, migrations handle schema updates
- Decisions saved automatically on edit approval and review acceptance
- Context Collector queries recent decisions for current file/project
- Webview UI for browsing decision history with filtering


### 6. Context Collector Enhancement

**Purpose**: Gathers relevant code context and past decisions for AI operations.

**Interface**:
```typescript
interface CollectedContext {
  openFiles: FileContext[];
  currentSelection: SelectionContext;
  fileStructure: StructureContext;
  importRelationships: ImportGraph;
  pastDecisions: Decision[];
  totalTokens: number;
}

interface FileContext {
  path: string;
  content: string;
  language: string;
  lastModified: number;
  priority: number;
}

interface SelectionContext {
  file: string;
  content: string;
  startLine: number;
  endLine: number;
}

interface StructureContext {
  directories: string[];
  files: string[];
  packageInfo?: any;
}

interface ImportGraph {
  imports: Map<string, string[]>;
  exports: Map<string, string[]>;
}

class ContextCollector {
  constructor(
    private journal: DecisionJournal,
    private maxTokens: number
  );

  async collectContext(operation: string, scope: 'file' | 'project'): Promise<CollectedContext>;
  async prioritizeFiles(files: FileContext[]): FileContext[];
  async truncateToLimit(context: CollectedContext): CollectedContext;
  
  private estimateTokens(text: string): number;
  private buildImportGraph(files: FileContext[]): ImportGraph;
}
```

**Implementation Details**:
- Extends existing ContextGatherer from reviewContext.ts
- Prioritization algorithm: current selection > recently modified > imported files > other open files
- Token estimation uses rough heuristic (chars / 4)
- Truncation preserves high-priority items, summarizes low-priority
- Past decisions limited to last 10 for current file, last 5 for project
- Import graph built by parsing import/require statements

**Prioritization Algorithm**:
```
Priority Score = 
  (isCurrentFile ? 100 : 0) +
  (hasSelection ? 50 : 0) +
  (recentlyModified ? 30 : 0) +
  (isImported ? 20 : 0) +
  (isOpen ? 10 : 0)
```


## Data Models

### Structured Response Schema

```typescript
interface StructuredResponse {
  what: string;           // Required: What is happening
  why: string;            // Required: Why it works or fails
  improvements: string;   // Required: Potential improvements
  tradeoffs: string;      // Required: Tradeoffs and considerations
  production: string;     // Required: Production implications
  metadata?: {
    model: string;
    timestamp: number;
    tokensUsed?: number;
    confidence?: number;
  };
}
```

**Validation Rules**:
- All 5 fields (what, why, improvements, tradeoffs, production) must be non-empty strings
- Each field must contain at least 10 characters
- Metadata is optional but recommended

### SQLite Database Schema

```sql
-- Decisions table
CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  project_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  change_type TEXT NOT NULL,
  description TEXT NOT NULL,
  reasoning_what TEXT NOT NULL,
  reasoning_why TEXT NOT NULL,
  reasoning_improvements TEXT NOT NULL,
  reasoning_tradeoffs TEXT NOT NULL,
  reasoning_production TEXT NOT NULL,
  approved INTEGER NOT NULL,
  metadata_json TEXT,
  CONSTRAINT valid_change_type CHECK (change_type IN ('edit', 'review', 'refactor', 'optimization'))
);

-- Indexes for efficient querying
CREATE INDEX idx_decisions_project ON decisions(project_id);
CREATE INDEX idx_decisions_file ON decisions(file_path);
CREATE INDEX idx_decisions_timestamp ON decisions(timestamp);
CREATE INDEX idx_decisions_type ON decisions(change_type);

-- Schema version tracking
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

INSERT INTO schema_version (version, applied_at) VALUES (1, strftime('%s', 'now'));
```

**Migration Strategy**:
- Version 1: Initial schema (above)
- Future versions: Add columns with ALTER TABLE, maintain backward compatibility
- Migration function checks current version and applies incremental updates


### Provider Integration Model

```typescript
// Existing AIProvider interface (unchanged)
interface AIProvider {
  readonly name: string;
  readonly type: 'online' | 'local';
  isAvailable(): Promise<boolean>;
  chat(messages: Message[], context: Context): Promise<ChatResponse>;
  explain(code: string, context: Context): Promise<string>;
  review(code: string, context: Context): Promise<ReviewComment[]>;
  generateDiff(code: string, instruction: string, context: Context): Promise<UnifiedDiff>;
}

// New wrapper that adds structured reasoning
class StructuredProvider implements AIProvider {
  constructor(
    private baseProvider: AIProvider,
    private router: LLMRouter
  );

  // Delegates to baseProvider but routes through LLMRouter
  async chat(messages: Message[], context: Context): Promise<ChatResponse> {
    const rawResponse = await this.baseProvider.chat(messages, context);
    const structured = await this.router.transformResponse(rawResponse.content, 'chat');
    return {
      ...rawResponse,
      content: this.formatStructuredResponse(structured)
    };
  }

  // Similar wrapping for explain, review, generateDiff
}
```

**Integration Approach**:
- StructuredProvider wraps existing LocalProvider and OnlineProvider
- ProviderResolver returns StructuredProvider instead of base provider
- Existing code continues to use AIProvider interface
- No changes required to LocalProvider or OnlineProvider implementations


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified the following redundancies:
- Properties 1.1 and 6.2 both test schema validation (consolidated into Property 1)
- Properties 1.4 and 7.2 both test LLM output transformation (consolidated into Property 2)
- Properties 4.4 and 4.5 both test structured format in performance analysis (consolidated into Property 8)
- Properties 5.5 and 8.2 both test decision retrieval in context (consolidated into Property 13)
- Properties 5.6, 12.3, and 12.4 all test query filtering (consolidated into Property 11)
- Properties 3.6 and 13.4 both test partial hunk application (consolidated into Property 6)

The following properties provide unique validation value and are retained:

### Property 1: Response Validation Completeness

*For any* AI response object, validation should correctly identify whether all five mandatory sections (what, why, improvements, tradeoffs, production) are present and return the specific list of missing sections if validation fails.

**Validates: Requirements 1.1, 6.2, 6.3**

### Property 2: LLM Output Transformation

*For any* raw LLM output string, the LLM Router should transform it into a valid StructuredResponse that passes Response Formatter validation, or trigger regeneration if transformation fails after max retries.

**Validates: Requirements 1.4, 7.2**

### Property 3: Consistent Formatting Across Operations

*For any* AI operation type (chat, review, edit, performance analysis), the Structured Reasoning Engine should apply the same formatting rules and produce responses with identical structure.

**Validates: Requirements 1.5**

### Property 4: Inline Comment Line Association

*For any* code review result, all generated inline comments should have line numbers that fall within the valid range of the reviewed code (1 to total lines).

**Validates: Requirements 2.1**


### Property 5: Comment Consolidation Preserves Information

*For any* set of multiple inline comments on the same line, consolidating them into a single comment should preserve all unique information from the original comments in the combined structured reasoning.

**Validates: Requirements 2.4**

### Property 6: Partial Diff Application

*For any* multi-hunk unified diff and any subset of hunks, applying only the selected hunks should produce valid code that incorporates exactly those changes and leaves unselected hunks unchanged.

**Validates: Requirements 3.6, 13.4**

### Property 7: Diff Rejection Preserves Original

*For any* proposed code edit, rejecting the diff should leave the original file content completely unchanged (byte-for-byte identical).

**Validates: Requirements 3.4**

### Property 8: Performance Analysis Completeness

*For any* code block analyzed for performance, the result should include time complexity (best, average, worst), space complexity (auxiliary, total), edge cases, and optimization suggestions, all presented in structured format.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

### Property 9: Performance Analysis Scope Support

*For any* valid code construct (function, method, class, code block), the Performance Analyzer should successfully analyze it without errors.

**Validates: Requirements 4.6**

### Property 10: Decision Persistence Round-Trip

*For any* decision object, saving it to SQLite Memory and then retrieving it by ID should return an equivalent decision with all fields preserved.

**Validates: Requirements 5.1, 5.2**

### Property 11: Decision Query Filtering

*For any* decision query with filters (project_id, file_path, date range, change_type), all returned decisions should match the specified filter criteria.

**Validates: Requirements 5.6, 12.3, 12.4**

### Property 12: Decision Journal Approval Recording

*For any* approved code edit or review suggestion, a corresponding decision record should be created in the Decision Journal with all required fields (timestamp, file_path, description, reasoning, approved=true).

**Validates: Requirements 3.5, 5.2, 5.3**


### Property 13: Context Includes Past Decisions

*For any* AI operation on a file with existing decisions in the Decision Journal, the Context Collector should include those relevant past decisions in the collected context.

**Validates: Requirements 5.5, 8.2**

### Property 14: Context Token Limit Enforcement

*For any* collected context, the total estimated token count should never exceed the configured maximum token limit.

**Validates: Requirements 8.4**

### Property 15: Context Prioritization Order

*For any* set of files in the workspace, the Context Collector should prioritize them such that current selection appears before recently modified files, which appear before imported files, which appear before other open files.

**Validates: Requirements 8.5**

### Property 16: Markdown Rendering Preserves Code Blocks

*For any* structured response containing code blocks, rendering to markdown format should preserve the code blocks with their original content and syntax highlighting language tags.

**Validates: Requirements 6.6**

### Property 17: Provider Compatibility

*For any* AI operation, the LLM Router should successfully process responses from both LocalProvider and OnlineProvider without errors.

**Validates: Requirements 7.5**

### Property 18: Streaming Response Buffering

*For any* streaming response from a provider, the LLM Router should buffer the complete response before attempting to parse structure, ensuring no partial parsing occurs.

**Validates: Requirements 7.6**

### Property 19: Offline Mode Feature Availability

*For any* core feature (chat, review, edit, performance analysis), when LocalProvider is active, the feature should remain available and functional.

**Validates: Requirements 9.1, 9.4**

### Property 20: Offline Mode Formatting Consistency

*For any* AI response generated through LocalProvider, the structured reasoning format should be identical to responses generated through OnlineProvider.

**Validates: Requirements 9.2**


### Property 21: Backward Compatibility of Commands

*For any* existing command interface (chat, review, edit, search), after implementing new features, the command should still execute successfully with the same input parameters.

**Validates: Requirements 10.1**

### Property 22: Provider Interface Stability

*For any* existing AIProvider implementation, it should continue to satisfy the AIProvider interface contract without modification.

**Validates: Requirements 10.2**

### Property 23: Configuration Compatibility

*For any* existing configuration file, the system should successfully parse and apply the configuration without errors.

**Validates: Requirements 10.3**

### Property 24: Chat History Compatibility

*For any* existing chat history data, the system should successfully load and display it without errors or data loss.

**Validates: Requirements 10.6**

### Property 25: Database Schema Integrity

*For any* SQLite database created by SQLite_Memory, the decisions table should have all required columns (id, timestamp, project_id, file_path, change_type, description, reasoning fields, approved) and indexes (project_id, file_path, timestamp).

**Validates: Requirements 14.2, 14.3**

### Property 26: Database Migration Idempotence

*For any* database schema version, applying the migration multiple times should result in the same final schema state without errors.

**Validates: Requirements 14.4**

### Property 27: Database Write Validation

*For any* invalid decision data (missing required fields, invalid change_type), attempting to write to SQLite_Memory should reject the write and return an error.

**Validates: Requirements 14.5**

### Property 28: Concurrent Read Safety

*For any* SQLite database, multiple concurrent read queries should execute successfully without blocking or data corruption.

**Validates: Requirements 14.6**


### Property 29: Graceful Database Error Handling

*For any* database error encountered by SQLite_Memory, the system should log the error and continue operation without crashing, with decision persistence disabled for that operation.

**Validates: Requirements 15.2**

### Property 30: Unparseable Output Fallback

*For any* LLM output that cannot be parsed into structured format after max retries, the system should display the raw output with a warning message rather than crashing.

**Validates: Requirements 15.3**

### Property 31: Uncertainty Reporting

*For any* code where Performance Analyzer cannot determine complexity with confidence, the result should explicitly report uncertainty with reasoning explaining why complexity is unclear.

**Validates: Requirements 15.4**

### Property 32: Context Truncation Priority Preservation

*For any* collected context that exceeds token limits, truncation should preserve all high-priority items (current selection, recently modified files) before removing low-priority items.

**Validates: Requirements 15.5**

### Property 33: Error Containment

*For any* internal error in any module (Response Formatter, LLM Router, Decision Journal, etc.), the error should be caught and handled without causing VS Code to crash.

**Validates: Requirements 15.6**


## Error Handling

### Error Categories and Strategies

#### 1. Validation Errors (Response Formatter)

**Scenario**: AI response missing required sections

**Strategy**: 
- Return ValidationResult with specific missing sections
- Trigger regeneration through LLM Router (up to maxRetries)
- If all retries exhausted, display error message to user with option to retry manually
- Never crash or block workflow

**Implementation**:
```typescript
try {
  const validation = formatter.validate(response);
  if (!validation.valid) {
    if (retryCount < maxRetries) {
      return await requestRegeneration(messages, validation.missingSections);
    } else {
      showWarning(`AI response incomplete. Missing: ${validation.missingSections.join(', ')}`);
      return fallbackResponse;
    }
  }
} catch (error) {
  logError('Response validation failed', error);
  return fallbackResponse;
}
```

#### 2. Database Errors (SQLite Memory)

**Scenario**: Database file locked, corrupted, or disk full

**Strategy**:
- Log error with full context
- Continue operation without decision persistence
- Show non-blocking notification to user
- Attempt to recover on next operation

**Implementation**:
```typescript
try {
  await sqliteMemory.insert('decisions', decision);
} catch (error) {
  logError('Failed to persist decision', error);
  showInformationMessage('Decision not saved to history due to database error');
  // Continue without throwing
}
```

#### 3. Provider Errors (LLM Router)

**Scenario**: Network timeout, API error, model unavailable

**Strategy**:
- Catch provider-specific errors
- Attempt fallback to alternative provider if available
- Display clear error message with suggested actions
- Allow user to retry or cancel

**Implementation**:
```typescript
try {
  return await onlineProvider.chat(messages, context);
} catch (error) {
  if (await localProvider.isAvailable()) {
    showInformationMessage('Online provider failed, falling back to local');
    return await localProvider.chat(messages, context);
  } else {
    throw new Error('No AI provider available. Check connection and Ollama status.');
  }
}
```


#### 4. Parsing Errors (LLM Router)

**Scenario**: Cannot extract structured sections from raw output

**Strategy**:
- Apply heuristic post-processing to extract sections
- If post-processing fails, request regeneration with explicit instructions
- After max retries, display raw output with warning
- Never hide information from user

**Implementation**:
```typescript
try {
  return parseStructuredResponse(rawOutput);
} catch (error) {
  const postProcessed = applyHeuristicParsing(rawOutput);
  if (postProcessed) {
    return postProcessed;
  }
  
  if (retryCount < maxRetries) {
    return await regenerateWithExplicitInstructions(messages);
  }
  
  showWarning('Could not parse structured response. Showing raw output.');
  return createFallbackResponse(rawOutput);
}
```

#### 5. Context Overflow (Context Collector)

**Scenario**: Collected context exceeds token limit

**Strategy**:
- Truncate low-priority items first
- Preserve current selection and recently modified files
- Log truncation event for debugging
- Continue with truncated context

**Implementation**:
```typescript
if (context.totalTokens > maxTokens) {
  const truncated = truncateToLimit(context);
  logInfo(`Context truncated from ${context.totalTokens} to ${truncated.totalTokens} tokens`);
  return truncated;
}
```

#### 6. File System Errors (Diff Engine)

**Scenario**: Cannot read/write file, permission denied

**Strategy**:
- Catch file system errors before attempting operations
- Display clear error message with file path
- Offer to retry or open file manually
- Never partially apply changes

**Implementation**:
```typescript
try {
  const content = await workspace.fs.readFile(uri);
  await workspace.fs.writeFile(uri, modifiedContent);
} catch (error) {
  if (error.code === 'EACCES') {
    showErrorMessage(`Permission denied: ${uri.fsPath}`);
  } else if (error.code === 'ENOENT') {
    showErrorMessage(`File not found: ${uri.fsPath}`);
  } else {
    showErrorMessage(`Failed to apply changes: ${error.message}`);
  }
  // Rollback any partial changes
  await rollbackChanges(uri);
}
```

### Global Error Boundary

All modules wrapped in try-catch at top level to prevent VS Code crashes:

```typescript
export function activate(context: vscode.ExtensionContext) {
  try {
    // Extension initialization
    registerCommands(context);
    initializeProviders(context);
    // ...
  } catch (error) {
    logError('Extension activation failed', error);
    showErrorMessage('Orbit failed to activate. Check output panel for details.');
  }
}
```


## Testing Strategy

### Dual Testing Approach

This implementation requires both unit tests and property-based tests to ensure comprehensive coverage:

**Unit Tests**: Focus on specific examples, edge cases, and integration points
- Specific response validation scenarios (missing one section, missing all sections, valid response)
- Database schema creation and migration steps
- UI component rendering with sample data
- Command registration and activation
- Error handling for specific error types

**Property-Based Tests**: Verify universal properties across all inputs
- Response validation with randomly generated responses
- Context collection with random file sets
- Diff application with random code changes
- Decision persistence round-trips with random decision data
- Query filtering with random filter combinations

Both approaches are complementary: unit tests catch concrete bugs in specific scenarios, while property tests verify general correctness across the input space.

### Property-Based Testing Configuration

**Library Selection**:
- TypeScript/JavaScript: Use `fast-check` library
- Minimum 100 iterations per property test
- Each test tagged with reference to design property

**Example Property Test**:
```typescript
import fc from 'fast-check';

// Feature: orbit-mvp-v2-implementation, Property 1: Response Validation Completeness
describe('Response Validation', () => {
  it('should identify all missing sections', () => {
    fc.assert(
      fc.property(
        fc.record({
          what: fc.option(fc.string(), { nil: undefined }),
          why: fc.option(fc.string(), { nil: undefined }),
          improvements: fc.option(fc.string(), { nil: undefined }),
          tradeoffs: fc.option(fc.string(), { nil: undefined }),
          production: fc.option(fc.string(), { nil: undefined })
        }),
        (response) => {
          const formatter = new ResponseFormatter();
          const result = formatter.validate(response);
          
          const expectedMissing = [];
          if (!response.what) expectedMissing.push('what');
          if (!response.why) expectedMissing.push('why');
          if (!response.improvements) expectedMissing.push('improvements');
          if (!response.tradeoffs) expectedMissing.push('tradeoffs');
          if (!response.production) expectedMissing.push('production');
          
          expect(result.valid).toBe(expectedMissing.length === 0);
          expect(result.missingSections.sort()).toEqual(expectedMissing.sort());
        }
      ),
      { numRuns: 100 }
    );
  });
});
```


### Unit Test Coverage Areas

#### Response Formatter
- Valid response with all sections passes validation
- Response missing single section fails with correct error
- Response with empty strings fails validation
- Markdown rendering produces correct format
- Webview rendering produces valid HTML
- Code blocks preserved in rendering

#### LLM Router
- Successful transformation of well-structured output
- Retry logic triggers on missing structure
- Fallback to raw output after max retries
- Streaming response buffering completes before parsing
- Compatible with LocalProvider responses
- Compatible with OnlineProvider responses

#### Code Review Engine
- Inline comments generated with valid line numbers
- Multiple findings on same line consolidated correctly
- Structured reasoning present in all comments
- Existing review functionality preserved

#### Diff Engine
- Unified diff generated correctly
- Hunks parsed with correct line numbers
- Partial hunk application produces valid code
- Rejection leaves original unchanged
- Approval logs decision to journal

#### Performance Analyzer
- Analysis includes time complexity
- Analysis includes space complexity
- Edge cases identified
- Optimization suggestions provided
- Uncertainty reported when complexity unclear

#### Decision Journal
- Decision saved with all required fields
- Query filters return correct results
- Round-trip preserves all data
- Database file created in correct location

#### Context Collector
- Open files included in context
- Past decisions retrieved for current file
- Token limit enforced
- Prioritization order correct
- Truncation preserves high-priority items

#### SQLite Memory
- Schema created with all tables and indexes
- Migrations apply correctly
- Invalid data rejected
- Concurrent reads succeed
- Database errors handled gracefully

### Integration Tests

- End-to-end chat flow with structured response
- End-to-end review flow with inline comments
- End-to-end edit flow with diff approval
- End-to-end performance analysis
- Decision journal integration with all features
- Provider fallback from online to local
- Offline mode with LocalProvider

### Test Data Generators

Property-based tests require generators for:
- Random structured responses (with/without sections)
- Random code snippets (various languages)
- Random file paths and content
- Random decision records
- Random unified diffs
- Random query filters


## Implementation Approach

### Phase 1: Core Infrastructure (Structured Reasoning Engine)

**Goal**: Establish foundation for structured reasoning across all operations

**Components**:
1. Response Formatter module with validation and rendering
2. LLM Router with transformation and retry logic
3. StructuredProvider wrapper for existing providers
4. Integration with ProviderResolver

**Deliverables**:
- `src/reasoning/ResponseFormatter.ts`
- `src/reasoning/LLMRouter.ts`
- `src/reasoning/StructuredProvider.ts`
- `src/reasoning/types.ts`
- Unit tests for validation and transformation
- Property tests for validation completeness

**Success Criteria**:
- All AI operations return structured responses
- Validation correctly identifies missing sections
- Retry logic triggers on invalid responses
- Both LocalProvider and OnlineProvider work with wrapper

### Phase 2: Decision Journal and SQLite Memory

**Goal**: Implement persistent storage for development decisions

**Components**:
1. SQLite Memory module with schema and migrations
2. Decision Journal with save/query operations
3. Database initialization in workspace .orbit directory
4. Integration with Context Collector

**Deliverables**:
- `src/memory/SQLiteMemory.ts`
- `src/memory/DecisionJournal.ts`
- `src/memory/schema.sql`
- Unit tests for database operations
- Property tests for round-trip persistence and query filtering

**Success Criteria**:
- Database created on first use
- Decisions persist across sessions
- Queries return correct filtered results
- Migrations handle schema updates
- Errors handled gracefully without crashes


### Phase 3: Enhanced Code Review System

**Goal**: Add structured reasoning to code review with inline comments

**Components**:
1. Enhanced ReviewService with structured reasoning
2. Inline comment generation with line associations
3. Comment consolidation for multiple findings on same line
4. VS Code Diagnostic integration for inline display
5. CodeLens for expanding full reasoning

**Deliverables**:
- `src/review/EnhancedReviewService.ts`
- `src/review/InlineCommentGenerator.ts`
- Updates to `src/reviewAnnotations.ts`
- Updates to `src/reviewCodeLens.ts`
- Unit tests for comment generation and consolidation
- Property tests for line number validity and consolidation

**Success Criteria**:
- Review generates inline comments with structured reasoning
- Comments appear at correct line numbers in editor
- Multiple findings on same line consolidated
- Existing review functionality preserved
- CodeLens shows "View Reasoning" action

### Phase 4: Diff Engine with Approval Flow

**Goal**: Implement diff-based edits with structured reasoning and approval

**Components**:
1. Enhanced Diff Engine with hunk parsing
2. Webview UI for diff presentation with reasoning
3. Approval/rejection workflow
4. Partial hunk selection
5. Integration with Decision Journal

**Deliverables**:
- `src/edit/EnhancedDiffEngine.ts`
- `src/edit/DiffApprovalView.ts` (webview)
- `webview-ui/src/components/DiffApproval.tsx`
- Updates to `src/editCommand.ts`
- Unit tests for hunk parsing and partial application
- Property tests for diff application and rejection

**Success Criteria**:
- Diffs presented with structured reasoning
- Accept/Reject/Accept Partial buttons functional
- Partial approval applies only selected hunks
- Rejection leaves original unchanged
- Approval logs decision to journal


### Phase 5: Performance Analyzer Module

**Goal**: Implement complexity analysis with structured reasoning

**Components**:
1. Performance Analyzer with complexity detection
2. Edge case identification
3. Optimization suggestion generation
4. Output panel for results display
5. Command registration and keyboard shortcuts

**Deliverables**:
- `src/performance/PerformanceAnalyzer.ts`
- `src/performance/ComplexityDetector.ts`
- `src/performance/OutputFormatter.ts`
- Command: "Orbit: Analyze Performance"
- Unit tests for analysis and output formatting
- Property tests for analysis completeness and scope support

**Success Criteria**:
- Command available in command palette
- Analysis works on selection, current function, or code block
- Results include time/space complexity, edge cases, optimizations
- All results presented in structured format
- Uncertainty reported when complexity unclear

### Phase 6: Context Collector Enhancement

**Goal**: Improve context gathering with decision history and prioritization

**Components**:
1. Enhanced Context Collector with prioritization
2. Integration with Decision Journal for past decisions
3. Import graph builder
4. Token estimation and truncation
5. Multi-file context support

**Deliverables**:
- `src/context/EnhancedContextCollector.ts`
- `src/context/ImportGraphBuilder.ts`
- `src/context/TokenEstimator.ts`
- Updates to `src/reviewContext.ts`
- Unit tests for prioritization and truncation
- Property tests for token limits and priority order

**Success Criteria**:
- Context includes open files, selection, structure, imports, decisions
- Prioritization follows defined algorithm
- Token limit never exceeded
- Truncation preserves high-priority items
- Works for single-file and multi-file operations


### Phase 7: UI Components and Commands

**Goal**: Implement user-facing commands and webview interfaces

**Components**:
1. Decision History webview with filtering
2. Diff Approval webview with hunk selection
3. Performance Analysis output panel
4. Command registrations
5. Keyboard shortcuts

**Deliverables**:
- `src/commands/viewDecisionHistory.ts`
- `webview-ui/src/components/DecisionHistory.tsx`
- `webview-ui/src/components/DiffApproval.tsx`
- Command: "Orbit: View Decision History"
- Command: "Orbit: Analyze Performance"
- Keyboard shortcuts configuration
- Unit tests for command handlers
- Integration tests for webview communication

**Success Criteria**:
- Decision History command shows recent decisions
- Filtering by file path and date range works
- Clicking decision navigates to file/line
- Diff Approval shows reasoning and diff side-by-side
- Performance output panel displays formatted results
- Keyboard shortcuts work (Enter to accept, Escape to reject)

### Phase 8: Integration and Polish

**Goal**: Ensure all components work together and handle edge cases

**Tasks**:
1. End-to-end integration testing
2. Error handling verification
3. Backward compatibility testing
4. Performance optimization
5. Documentation updates

**Deliverables**:
- Integration test suite
- Error handling test suite
- Backward compatibility test suite
- Performance benchmarks
- Updated README and documentation

**Success Criteria**:
- All features work together seamlessly
- No breaking changes to existing workflows
- Errors handled gracefully without crashes
- Performance acceptable (no noticeable slowdown)
- Documentation complete and accurate


## File Structure

```
src/
├── reasoning/                    # Phase 1: Structured Reasoning Engine
│   ├── ResponseFormatter.ts      # Validates and formats structured responses
│   ├── LLMRouter.ts              # Transforms raw LLM output to structured format
│   ├── StructuredProvider.ts     # Wraps existing providers with structured reasoning
│   └── types.ts                  # Shared types for structured responses
│
├── memory/                       # Phase 2: Decision Journal & SQLite
│   ├── SQLiteMemory.ts           # Low-level SQLite operations
│   ├── DecisionJournal.ts        # High-level decision persistence and querying
│   ├── schema.sql                # Database schema definition
│   └── migrations.ts             # Schema migration logic
│
├── review/                       # Phase 3: Enhanced Code Review
│   ├── EnhancedReviewService.ts  # Review with structured reasoning
│   ├── InlineCommentGenerator.ts # Generates inline comments with line associations
│   └── CommentConsolidator.ts    # Merges multiple findings on same line
│
├── edit/                         # Phase 4: Diff Engine with Approval
│   ├── EnhancedDiffEngine.ts     # Diff generation with structured reasoning
│   ├── DiffApprovalView.ts       # Webview for diff approval UI
│   ├── HunkParser.ts             # Parses unified diff into hunks
│   └── PartialDiffApplicator.ts  # Applies selected hunks only
│
├── performance/                  # Phase 5: Performance Analyzer
│   ├── PerformanceAnalyzer.ts    # Main analyzer with complexity detection
│   ├── ComplexityDetector.ts     # Heuristics for time/space complexity
│   ├── EdgeCaseIdentifier.ts     # Identifies performance edge cases
│   └── OutputFormatter.ts        # Formats analysis results
│
├── context/                      # Phase 6: Context Collector Enhancement
│   ├── EnhancedContextCollector.ts # Context gathering with prioritization
│   ├── ImportGraphBuilder.ts     # Builds import relationship graph
│   ├── TokenEstimator.ts         # Estimates token count for truncation
│   └── ContextPrioritizer.ts     # Prioritizes files for context inclusion
│
├── commands/                     # Phase 7: Commands and UI
│   ├── viewDecisionHistory.ts    # Command to view decision history
│   ├── analyzePerformance.ts     # Command to analyze performance
│   └── commandRegistry.ts        # Registers all commands
│
└── extension.ts                  # Main extension entry point (updated)

webview-ui/src/components/
├── DecisionHistory.tsx           # Decision history browser with filtering
├── DiffApproval.tsx              # Diff approval UI with hunk selection
└── StructuredReasoning.tsx       # Reusable component for displaying structured reasoning

test/
├── unit/
│   ├── reasoning/                # Unit tests for structured reasoning
│   ├── memory/                   # Unit tests for decision journal
│   ├── review/                   # Unit tests for enhanced review
│   ├── edit/                     # Unit tests for diff engine
│   ├── performance/              # Unit tests for performance analyzer
│   └── context/                  # Unit tests for context collector
│
└── property/                     # Property-based tests
    ├── responseValidation.test.ts
    ├── decisionPersistence.test.ts
    ├── diffApplication.test.ts
    ├── contextCollection.test.ts
    └── errorHandling.test.ts
```


## Dependencies

### New Dependencies to Add

```json
{
  "dependencies": {
    "better-sqlite3": "^9.2.2",      // SQLite database for decision journal
    "@types/better-sqlite3": "^7.6.8"
  },
  "devDependencies": {
    "fast-check": "^3.15.0",         // Property-based testing library
    "@types/fast-check": "^3.15.0"
  }
}
```

### Existing Dependencies (No Changes)

- `vscode`: VS Code extension API
- `typescript`: TypeScript compiler
- `jest`: Unit testing framework
- `react`: UI components for webviews
- `webpack`: Bundling

### Rationale for New Dependencies

**better-sqlite3**:
- Synchronous SQLite API (simpler than async for this use case)
- No native dependencies (pure JavaScript)
- Well-maintained and widely used
- Supports concurrent reads
- Good performance for local storage

**fast-check**:
- Industry-standard property-based testing for TypeScript
- Excellent generator library for random data
- Shrinking support for minimal failing examples
- Good integration with Jest
- Active development and community


## Configuration

### Extension Configuration Schema

New configuration options to add to `package.json`:

```json
{
  "configuration": {
    "title": "Orbit",
    "properties": {
      "orbit.reasoning.maxRetries": {
        "type": "number",
        "default": 3,
        "description": "Maximum number of retries when LLM output lacks structured format"
      },
      "orbit.reasoning.fallbackToRaw": {
        "type": "boolean",
        "default": true,
        "description": "Display raw output if structured format cannot be extracted after retries"
      },
      "orbit.context.maxTokens": {
        "type": "number",
        "default": 4000,
        "description": "Maximum token count for collected context"
      },
      "orbit.context.includeDecisions": {
        "type": "boolean",
        "default": true,
        "description": "Include past decisions from Decision Journal in context"
      },
      "orbit.decisionJournal.enabled": {
        "type": "boolean",
        "default": true,
        "description": "Enable decision journal persistence"
      },
      "orbit.decisionJournal.maxHistoryItems": {
        "type": "number",
        "default": 10,
        "description": "Maximum number of past decisions to include in context"
      },
      "orbit.performance.showUncertainty": {
        "type": "boolean",
        "default": true,
        "description": "Report uncertainty when complexity analysis is unclear"
      }
    }
  }
}
```

### Backward Compatibility

All existing configuration options remain unchanged:
- `orbit.provider.online.endpoint`
- `orbit.provider.online.apiKey`
- `orbit.provider.local.endpoint`
- `orbit.provider.local.model`
- `orbit.review.enabledCategories`
- `orbit.review.minSeverity`


## Security Considerations

### 1. SQLite Database Security

**Threat**: Unauthorized access to decision history containing sensitive code information

**Mitigation**:
- Database stored in workspace `.orbit` directory (not synced to git by default)
- File permissions set to user-only read/write (0600)
- No network access to database
- Recommend adding `.orbit/` to `.gitignore`

### 2. API Key Storage

**Threat**: API keys exposed in configuration or logs

**Mitigation**:
- Existing configuration already uses VS Code secrets API
- Never log API keys or tokens
- Mask API keys in error messages
- No changes to existing secure storage

### 3. Code Context Leakage

**Threat**: Sensitive code sent to online providers without user awareness

**Mitigation**:
- Clear indication when online provider is active
- Option to disable online provider in settings
- Context collection respects `.gitignore` patterns
- User controls what files are open (and thus included in context)

### 4. Injection Attacks

**Threat**: Malicious code in LLM responses executed by extension

**Mitigation**:
- All LLM output treated as untrusted data
- No `eval()` or dynamic code execution
- Webview content sanitized
- Code blocks displayed as text, not executed

### 5. Database Injection

**Threat**: SQL injection through decision data

**Mitigation**:
- Use parameterized queries exclusively
- Validate all input data before insertion
- No string concatenation for SQL queries
- better-sqlite3 provides automatic parameterization

**Example Safe Query**:
```typescript
// Safe: parameterized query
const stmt = db.prepare('SELECT * FROM decisions WHERE project_id = ?');
const results = stmt.all(projectId);

// NEVER: string concatenation
// const results = db.exec(`SELECT * FROM decisions WHERE project_id = '${projectId}'`);
```


## Performance Considerations

### 1. Database Performance

**Optimization Strategies**:
- Indexes on frequently queried columns (project_id, file_path, timestamp)
- Prepared statements cached and reused
- Batch inserts for multiple decisions
- Read-only connections for queries
- WAL mode for better concurrent access

**Expected Performance**:
- Insert: < 5ms per decision
- Query: < 10ms for typical filters
- Database size: ~1KB per decision (10,000 decisions = ~10MB)

### 2. Context Collection Performance

**Optimization Strategies**:
- Lazy loading of file content (only when needed)
- Caching of import graphs (invalidate on file change)
- Parallel file reads using Promise.all
- Early termination when token limit reached
- Debouncing for rapid file changes

**Expected Performance**:
- Single file context: < 50ms
- Multi-file context (10 files): < 200ms
- Import graph build: < 100ms for typical project

### 3. LLM Response Processing

**Optimization Strategies**:
- Streaming response buffering (don't block on partial data)
- Parallel validation and rendering
- Cached regex patterns for parsing
- Lazy rendering of webview content

**Expected Performance**:
- Validation: < 5ms per response
- Parsing: < 20ms per response
- Markdown rendering: < 10ms per response
- Webview rendering: < 50ms per response

### 4. UI Responsiveness

**Optimization Strategies**:
- All AI operations run asynchronously (no blocking)
- Progress indicators for long operations
- Cancellation support for user-initiated operations
- Debouncing for rapid user input
- Virtual scrolling for large decision history lists

**Expected Performance**:
- Command activation: < 10ms
- Webview open: < 100ms
- Decision history load (100 items): < 200ms
- Diff presentation: < 50ms

### 5. Memory Usage

**Optimization Strategies**:
- Stream large responses instead of buffering entirely
- Dispose of webviews when closed
- Clear cached data periodically
- Limit decision history in memory (query on demand)
- Use WeakMap for temporary caches

**Expected Memory Usage**:
- Base extension: ~10MB
- Per webview: ~5MB
- Decision cache: ~1MB per 100 decisions
- Context cache: ~2MB per project


## Migration Strategy

### Backward Compatibility Guarantees

1. **Existing Commands**: All existing commands continue to work with same parameters
2. **Provider Interface**: AIProvider interface unchanged, existing providers work as-is
3. **Configuration**: All existing config options preserved, new options are additive
4. **Chat History**: Existing chat history loads without modification
5. **Review Data**: Existing review findings format compatible

### Migration Path for Users

**Phase 1: Transparent Enhancement**
- Install updated extension
- Existing workflows continue unchanged
- Structured reasoning appears automatically in responses
- No user action required

**Phase 2: Opt-In Features**
- User discovers new commands in command palette
- Decision Journal starts recording on first approval
- Performance analysis available when needed
- User explores at their own pace

**Phase 3: Full Adoption**
- User relies on structured reasoning for understanding
- Decision history provides valuable context
- Performance analysis becomes part of workflow
- Diff approval prevents accidental changes

### Rollback Plan

If issues arise, users can:
1. Disable decision journal: `orbit.decisionJournal.enabled: false`
2. Disable context decisions: `orbit.context.includeDecisions: false`
3. Revert to previous extension version
4. Delete `.orbit/decisions.db` to clear history

### Data Migration

**Decision Journal**:
- No existing data to migrate (new feature)
- Database created on first use
- Schema version tracked for future migrations

**Configuration**:
- New config options have sensible defaults
- No migration of existing config needed
- Old config continues to work


## Monitoring and Observability

### Logging Strategy

**Log Levels**:
- **Error**: Failures that prevent feature from working (database errors, provider failures)
- **Warning**: Degraded functionality (validation failures, missing sections, fallback to raw)
- **Info**: Normal operations (decision saved, context collected, analysis complete)
- **Debug**: Detailed information for troubleshooting (token counts, parsing steps, retry attempts)

**Log Locations**:
- VS Code Output Panel: "Orbit" channel for user-visible logs
- Extension Host Console: Debug logs for development
- File System: Optional log file in `.orbit/logs/` for debugging

**Example Logging**:
```typescript
const logger = {
  error: (message: string, error?: Error) => {
    outputChannel.appendLine(`[ERROR] ${message}`);
    if (error) outputChannel.appendLine(error.stack || error.message);
  },
  warning: (message: string) => {
    outputChannel.appendLine(`[WARNING] ${message}`);
  },
  info: (message: string) => {
    outputChannel.appendLine(`[INFO] ${message}`);
  },
  debug: (message: string) => {
    if (isDebugMode) outputChannel.appendLine(`[DEBUG] ${message}`);
  }
};
```

### Metrics Collection

**Key Metrics** (logged for analysis, not sent externally):
- Response validation success rate
- Average retry count for structured responses
- Context collection time
- Database operation time
- Decision journal usage (saves per session)
- Feature usage (chat, review, edit, performance analysis)

**Metrics Storage**:
- In-memory counters during session
- Optional export to JSON file for analysis
- No external telemetry (privacy-first)

### Health Checks

**Provider Health**:
- Periodic checks (every 5 minutes)
- Status indicator in status bar
- Automatic fallback on failure

**Database Health**:
- Check on startup
- Verify schema version
- Test write/read operations
- Report errors to user if database corrupted

**Extension Health**:
- Monitor for uncaught exceptions
- Track command execution failures
- Report health status in status bar


## Future Enhancements (Out of Scope for MVP)

The following capabilities are explicitly excluded from this MVP but may be considered for future versions:

### 1. Multi-File Reasoning
- Cross-file dependency analysis
- Repo-wide refactoring suggestions
- Architecture-level insights

### 2. Agentic Capabilities
- Background analysis without user initiation
- Proactive suggestions based on code changes
- Automated fix application with confidence thresholds

### 3. Cloud Synchronization
- Sync decision journal across machines
- Team-shared decision history
- Collaborative reasoning annotations

### 4. Advanced Analytics
- Decision pattern analysis
- Code quality trends over time
- Performance regression detection

### 5. Custom LLM Integration
- Fine-tuning on project-specific patterns
- Custom model training
- Domain-specific reasoning templates

### 6. IDE Integration Beyond VS Code
- JetBrains IDEs
- Vim/Neovim plugins
- Web-based editors

### 7. Real-Time Collaboration
- Shared reasoning sessions
- Live code review with multiple participants
- Synchronized decision making

### 8. Advanced Visualization
- Architecture diagrams from code
- Complexity heatmaps
- Decision flow graphs

These features would require significant additional design work and are not necessary for the core value proposition of reasoning-first AI assistance.


## Appendix: Example Structured Response

### Example 1: Code Review Comment

```json
{
  "what": "This function performs a linear search through an array to find a matching user ID. It iterates through all elements until a match is found or the array is exhausted.",
  
  "why": "The linear search works correctly for small arrays but becomes inefficient as the array grows. With O(n) time complexity, searching through 10,000 users requires up to 10,000 comparisons. The function also doesn't handle the case where the user ID might not exist, returning undefined implicitly.",
  
  "improvements": "Consider using a Map or Set for O(1) lookup time instead of an array. If the array must be used, sort it and use binary search for O(log n) complexity. Add explicit error handling for missing users. Consider caching frequently accessed users.",
  
  "tradeoffs": "Using a Map increases memory overhead slightly (~40 bytes per entry) but provides dramatically faster lookups. Binary search requires maintaining sorted order, which adds complexity to insertions. Caching adds memory usage and cache invalidation complexity.",
  
  "production": "In production with thousands of users, this linear search could cause noticeable latency (>100ms for 10,000 users). Monitor search performance and consider implementing the Map-based approach if user counts exceed 1,000. Ensure proper error handling to prevent undefined behavior when users aren't found."
}
```

### Example 2: Diff Explanation

```json
{
  "what": "Converting callback-based file reading to async/await syntax. The fs.readFile callback is replaced with fs.promises.readFile and await. Error handling moves from callback parameter to try-catch block.",
  
  "why": "Async/await improves readability by eliminating callback nesting and making asynchronous code look synchronous. Error handling becomes more intuitive with try-catch instead of checking callback parameters. The code is easier to reason about and maintain.",
  
  "improvements": "Add timeout handling to prevent indefinite hangs on slow file systems. Consider using streaming for large files instead of reading entire content into memory. Add file existence check before reading to provide better error messages.",
  
  "tradeoffs": "Requires Node.js 10+ for fs.promises support. Slightly different error handling semantics (thrown errors vs callback errors). May need to update tests that mock fs.readFile. Async functions always return promises, which affects calling code.",
  
  "production": "Ensure Node.js version is 10 or higher in production environment. Test error paths thoroughly, especially file not found and permission denied scenarios. Monitor memory usage with large files. Consider adding retry logic for transient file system errors."
}
```

### Example 3: Performance Analysis

```json
{
  "what": "This sorting algorithm implements bubble sort, repeatedly comparing adjacent elements and swapping them if they're in wrong order. It continues until no more swaps are needed, indicating the array is sorted.",
  
  "why": "Bubble sort works correctly but is inefficient for large datasets. Best case O(n) when array is already sorted, average and worst case O(n²) due to nested loops. Space complexity is O(1) as it sorts in-place. The algorithm is simple but impractical for production use with large arrays.",
  
  "improvements": "Replace with quicksort (O(n log n) average case) or use built-in Array.sort() which uses optimized Timsort. For nearly-sorted data, insertion sort performs better. For guaranteed O(n log n), use merge sort or heap sort.",
  
  "tradeoffs": "Quicksort is faster but uses O(log n) stack space for recursion. Merge sort guarantees O(n log n) but requires O(n) auxiliary space. Built-in sort is fastest but less educational. Bubble sort's simplicity makes it good for teaching but bad for production.",
  
  "production": "With 10,000 elements, bubble sort takes ~100 million comparisons vs ~140,000 for quicksort. This translates to seconds vs milliseconds. Use Array.sort() for production code unless you need stable sorting with specific comparison logic. Monitor sort performance and consider switching algorithms if array sizes grow beyond expectations."
}
```

