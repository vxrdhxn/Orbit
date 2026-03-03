# Implementation Plan: Orbit MVP v2

## Overview

This implementation plan transforms Orbit from a basic AI coding assistant into a reasoning-first AI coding companion. The plan follows 8 sequential phases, each building on the previous to deliver structured reasoning, enhanced code review, diff-based edits with approval, performance analysis, and a decision journal memory layer.

The implementation uses TypeScript and integrates with the existing VS Code extension architecture, maintaining backward compatibility while adding new capabilities. All 33 correctness properties from the design will be validated through property-based tests using fast-check.

## Tasks

### Phase 1: Core Infrastructure (Structured Reasoning Engine)

- [ ] 1. Set up project dependencies and type definitions
  - Add `better-sqlite3` and `fast-check` to package.json
  - Create `src/reasoning/types.ts` with StructuredResponse, ValidationResult, and LLMRouterConfig interfaces
  - Set up test infrastructure for property-based testing with fast-check
  - _Requirements: 1.1, 6.1_

- [ ] 2. Implement Response Formatter module
  - [ ] 2.1 Create ResponseFormatter class with validation logic
    - Implement `validate()` method to check for all 5 mandatory sections (what, why, improvements, tradeoffs, production)
    - Return ValidationResult with specific missing sections
    - Validate minimum content length (10 characters per section)
    - _Requirements: 1.1, 1.3, 6.2, 6.3_
  
  - [ ]* 2.2 Write property test for response validation completeness
    - **Property 1: Response Validation Completeness**
    - **Validates: Requirements 1.1, 6.2, 6.3**
    - Generate random responses with optional sections, verify validation correctly identifies all missing sections
  
  - [ ] 2.3 Implement rendering methods
    - Create `renderMarkdown()` for markdown format with headers
    - Create `renderWebview()` for HTML format with styled divs
    - Implement `extractCodeBlocks()` to preserve syntax highlighting
    - _Requirements: 6.4, 6.5, 6.6_
  
  - [ ]* 2.4 Write property test for code block preservation
    - **Property 16: Markdown Rendering Preserves Code Blocks**
    - **Validates: Requirements 6.6**
    - Generate responses with code blocks, verify rendering preserves content and language tags


- [ ] 3. Implement LLM Router with transformation logic
  - [ ] 3.1 Create LLMRouter class with provider wrapping
    - Implement constructor accepting AIProvider, ResponseFormatter, and config
    - Create `transformResponse()` method with regex parsing for section extraction
    - Implement heuristic post-processing for unstructured output
    - Add retry logic with `requestRegeneration()` method
    - _Requirements: 1.4, 7.1, 7.2, 7.3, 7.4_
  
  - [ ]* 3.2 Write property test for LLM output transformation
    - **Property 2: LLM Output Transformation**
    - **Validates: Requirements 1.4, 7.2**
    - Generate random LLM outputs, verify transformation produces valid StructuredResponse or triggers regeneration
  
  - [ ] 3.3 Implement streaming response buffering
    - Create `bufferStreamingResponse()` to collect complete response before parsing
    - Handle AsyncIterable<string> from streaming providers
    - _Requirements: 7.6_
  
  - [ ]* 3.4 Write property test for streaming buffering
    - **Property 18: Streaming Response Buffering**
    - **Validates: Requirements 7.6**
    - Generate streaming responses, verify complete buffering before parsing
  
  - [ ] 3.5 Implement chat, explain, review, and generateDiff methods
    - Wrap provider methods with structured reasoning transformation
    - Add structured reasoning instructions to system prompts
    - Handle errors and fallback to raw output after max retries
    - _Requirements: 1.2, 7.4_

- [ ] 4. Create StructuredProvider wrapper
  - [ ] 4.1 Implement StructuredProvider class
    - Wrap LocalProvider and OnlineProvider with LLMRouter
    - Delegate all AIProvider interface methods
    - Format structured responses for display
    - _Requirements: 7.5, 10.2_
  
  - [ ]* 4.2 Write property test for provider compatibility
    - **Property 17: Provider Compatibility**
    - **Validates: Requirements 7.5**
    - Test with both LocalProvider and OnlineProvider, verify successful processing
  
  - [ ] 4.3 Integrate with ProviderResolver
    - Update ProviderResolver to return StructuredProvider instances
    - Maintain backward compatibility with existing provider selection logic
    - _Requirements: 10.1, 10.2_

- [ ] 5. Write unit tests for Phase 1
  - [ ]* 5.1 Test response validation scenarios
    - Valid response with all sections passes
    - Missing single section fails with correct error
    - Empty strings fail validation
  
  - [ ]* 5.2 Test LLM Router transformation
    - Well-structured output transforms successfully
    - Retry logic triggers on missing structure
    - Fallback to raw output after max retries
  
  - [ ]* 5.3 Test provider compatibility
    - LocalProvider responses work correctly
    - OnlineProvider responses work correctly

- [ ]* 6. Write property test for consistent formatting
  - **Property 3: Consistent Formatting Across Operations**
  - **Validates: Requirements 1.5**
  - Test all operation types (chat, review, edit, performance), verify identical structure

- [ ] 7. Checkpoint - Verify structured reasoning works end-to-end
  - Test chat command with structured response
  - Verify validation catches missing sections
  - Confirm retry logic works
  - Ensure all tests pass, ask the user if questions arise


### Phase 2: Decision Journal and SQLite Memory

- [ ] 8. Create SQLite Memory module
  - [ ] 8.1 Implement SQLiteMemory class with database initialization
    - Create database file in workspace `.orbit/decisions.db`
    - Implement `initialize()` method with schema creation
    - Define decisions table with all required columns (id, timestamp, project_id, file_path, change_type, reasoning fields, approved)
    - Create indexes on project_id, file_path, timestamp, and change_type
    - _Requirements: 5.1, 14.1, 14.2, 14.3_
  
  - [ ]* 8.2 Write property test for database schema integrity
    - **Property 25: Database Schema Integrity**
    - **Validates: Requirements 14.2, 14.3**
    - Verify created database has all required columns and indexes
  
  - [ ] 8.3 Implement database migration system
    - Create schema_version table for tracking
    - Implement `migrate()` method for incremental updates
    - Ensure idempotent migrations
    - _Requirements: 14.4_
  
  - [ ]* 8.4 Write property test for migration idempotence
    - **Property 26: Database Migration Idempotence**
    - **Validates: Requirements 14.4**
    - Apply migrations multiple times, verify same final state
  
  - [ ] 8.5 Implement insert and query methods
    - Create `insert()` with parameterized queries
    - Implement `query()` with parameter binding
    - Add data validation before insertion
    - _Requirements: 14.5_
  
  - [ ]* 8.6 Write property test for write validation
    - **Property 27: Database Write Validation**
    - **Validates: Requirements 14.5**
    - Generate invalid decision data, verify rejection with errors
  
  - [ ] 8.7 Add concurrent read support
    - Configure SQLite for concurrent reads
    - Use read-only connections for queries
    - _Requirements: 14.6_
  
  - [ ]* 8.8 Write property test for concurrent read safety
    - **Property 28: Concurrent Read Safety**
    - **Validates: Requirements 14.6**
    - Execute multiple concurrent queries, verify no blocking or corruption

- [ ] 9. Implement Decision Journal
  - [ ] 9.1 Create DecisionJournal class with save operations
    - Implement `saveDecision()` to persist decisions with all required fields
    - Generate unique IDs and timestamps
    - Store structured reasoning in separate columns
    - _Requirements: 5.2, 5.3_
  
  - [ ]* 9.2 Write property test for decision persistence round-trip
    - **Property 10: Decision Persistence Round-Trip**
    - **Validates: Requirements 5.1, 5.2**
    - Save random decisions, retrieve by ID, verify all fields preserved
  
  - [ ] 9.3 Implement query methods
    - Create `queryDecisions()` with filter support (project_id, file_path, date range, change_type)
    - Implement `getRecentDecisions()` for context collection
    - Implement `getDecisionsForFile()` for file-specific history
    - _Requirements: 5.6_
  
  - [ ]* 9.4 Write property test for query filtering
    - **Property 11: Decision Query Filtering**
    - **Validates: Requirements 5.6, 12.3, 12.4**
    - Generate random queries with filters, verify all results match criteria

- [ ] 10. Add error handling for database operations
  - [ ] 10.1 Implement graceful error handling
    - Catch database errors without crashing
    - Log errors and continue operation
    - Display non-blocking notifications to user
    - _Requirements: 15.2_
  
  - [ ]* 10.2 Write property test for graceful database error handling
    - **Property 29: Graceful Database Error Handling**
    - **Validates: Requirements 15.2**
    - Simulate database errors, verify system continues without crashing

- [ ] 11. Write unit tests for Phase 2
  - [ ]* 11.1 Test database schema creation
    - Verify all tables and indexes created
    - Check schema version tracking
  
  - [ ]* 11.2 Test decision save and query
    - Save decision with all fields
    - Query by various filters
    - Verify round-trip data integrity
  
  - [ ]* 11.3 Test error handling
    - Database locked scenario
    - Invalid data rejection
    - Concurrent access

- [ ] 12. Checkpoint - Verify decision journal persistence
  - Create test decisions and verify persistence
  - Query decisions with various filters
  - Test error handling scenarios
  - Ensure all tests pass, ask the user if questions arise


### Phase 3: Enhanced Code Review System

- [ ] 13. Implement Enhanced Review Service
  - [ ] 13.1 Create EnhancedReviewService class
    - Extend existing ReviewService with structured reasoning
    - Integrate with LLMRouter for structured responses
    - Transform existing Finding objects to include StructuredResponse
    - Preserve existing review functionality (categories, severity levels)
    - _Requirements: 2.5, 10.1_
  
  - [ ] 13.2 Implement inline comment generation
    - Create InlineCommentGenerator class
    - Generate InlineComment objects with line associations
    - Include structured reasoning for each comment
    - Add suggested fixes with code snippets
    - _Requirements: 2.1, 2.2_
  
  - [ ]* 13.3 Write property test for line number validity
    - **Property 4: Inline Comment Line Association**
    - **Validates: Requirements 2.1**
    - Generate reviews for random code, verify all line numbers within valid range

- [ ] 14. Implement comment consolidation
  - [ ] 14.1 Create CommentConsolidator class
    - Group findings by line number
    - Merge multiple findings into single structured comment
    - Combine "what" sections into bulleted list
    - Merge "why", "improvements", "tradeoffs", "production" sections
    - _Requirements: 2.4_
  
  - [ ]* 14.2 Write property test for consolidation information preservation
    - **Property 5: Comment Consolidation Preserves Information**
    - **Validates: Requirements 2.4**
    - Generate multiple comments on same line, verify consolidation preserves all unique information

- [ ] 15. Integrate with VS Code editor
  - [ ] 15.1 Update reviewAnnotations.ts for inline display
    - Use VS Code Diagnostic API for inline comments
    - Display structured reasoning in diagnostic messages
    - Associate diagnostics with specific line numbers
    - _Requirements: 2.3_
  
  - [ ] 15.2 Update reviewCodeLens.ts for reasoning expansion
    - Add "View Reasoning" CodeLens action
    - Display full structured reasoning on click
    - Show expandable sections for each part
    - _Requirements: 2.3_

- [ ] 16. Write unit tests for Phase 3
  - [ ]* 16.1 Test inline comment generation
    - Comments have valid line numbers
    - Structured reasoning present in all comments
    - Suggested fixes included when applicable
  
  - [ ]* 16.2 Test comment consolidation
    - Multiple findings merged correctly
    - All information preserved
    - Structured format maintained
  
  - [ ]* 16.3 Test VS Code integration
    - Diagnostics appear at correct locations
    - CodeLens shows reasoning
    - Existing review functionality preserved

- [ ] 17. Checkpoint - Verify enhanced code review works
  - Run code review on sample files
  - Verify inline comments appear with structured reasoning
  - Test consolidation with multiple findings
  - Confirm CodeLens expansion works
  - Ensure all tests pass, ask the user if questions arise


### Phase 4: Diff Engine with Approval Flow

- [ ] 18. Implement Enhanced Diff Engine
  - [ ] 18.1 Create EnhancedDiffEngine class
    - Extend existing diff functionality with structured reasoning
    - Integrate with LLMRouter for diff generation
    - Generate DiffProposal objects with reasoning
    - Use existing applyUnifiedDiff function
    - _Requirements: 3.1, 3.2, 10.1_
  
  - [ ] 18.2 Implement hunk parsing
    - Create HunkParser class
    - Parse unified diff into individual DiffHunk objects
    - Extract line numbers from hunk headers (@@ -a,b +c,d @@)
    - Associate content with each hunk
    - _Requirements: 3.6_
  
  - [ ] 18.3 Implement partial diff application
    - Create PartialDiffApplicator class
    - Apply only selected hunks to original code
    - Validate resulting code is syntactically valid
    - _Requirements: 3.6_
  
  - [ ]* 18.4 Write property test for partial diff application
    - **Property 6: Partial Diff Application**
    - **Validates: Requirements 3.6, 13.4**
    - Generate multi-hunk diffs, apply random subsets, verify correct application

- [ ] 19. Implement approval workflow
  - [ ] 19.1 Create approval and rejection methods
    - Implement `applyDiff()` to apply changes and log to Decision Journal
    - Implement `rejectDiff()` to discard changes without modification
    - Add rollback capability for partial failures
    - _Requirements: 3.3, 3.4, 3.5_
  
  - [ ]* 19.2 Write property test for diff rejection
    - **Property 7: Diff Rejection Preserves Original**
    - **Validates: Requirements 3.4**
    - Generate random diffs, reject them, verify original unchanged byte-for-byte
  
  - [ ]* 19.3 Write property test for approval recording
    - **Property 12: Decision Journal Approval Recording**
    - **Validates: Requirements 3.5, 5.2, 5.3**
    - Approve random edits, verify decision records created with all required fields

- [ ] 20. Create Diff Approval webview UI
  - [ ] 20.1 Implement DiffApprovalView class
    - Create webview panel for diff presentation
    - Display structured reasoning above diff
    - Show VS Code native diff editor for before/after
    - Add Accept, Reject, Accept Partial buttons
    - _Requirements: 13.1, 13.2, 13.3_
  
  - [ ] 20.2 Create React component for diff approval
    - Build DiffApproval.tsx component
    - Display structured reasoning in collapsible sections
    - Show hunk selection checklist for partial approval
    - Add keyboard shortcuts (Enter to accept, Escape to reject)
    - _Requirements: 13.3, 13.4, 13.5, 13.6_
  
  - [ ] 20.3 Implement webview communication
    - Handle messages between extension and webview
    - Pass approval/rejection decisions back to extension
    - Update UI based on operation results

- [ ] 21. Update editCommand.ts integration
  - [ ] 21.1 Integrate EnhancedDiffEngine with edit command
    - Replace direct file modification with diff approval flow
    - Present diff in webview before applying
    - Require explicit user approval
    - _Requirements: 3.3, 10.1_

- [ ] 22. Write unit tests for Phase 4
  - [ ]* 22.1 Test hunk parsing
    - Unified diff parsed correctly
    - Line numbers extracted accurately
    - Content associated with hunks
  
  - [ ]* 22.2 Test partial application
    - Selected hunks applied correctly
    - Unselected hunks unchanged
    - Resulting code valid
  
  - [ ]* 22.3 Test approval workflow
    - Approval applies changes and logs decision
    - Rejection leaves original unchanged
    - Rollback works on failures
  
  - [ ]* 22.4 Test webview UI
    - Structured reasoning displays correctly
    - Buttons trigger correct actions
    - Keyboard shortcuts work

- [ ] 23. Checkpoint - Verify diff approval flow works
  - Generate test diffs with structured reasoning
  - Test full approval, rejection, and partial approval
  - Verify decision journal logging
  - Confirm webview UI displays correctly
  - Ensure all tests pass, ask the user if questions arise


### Phase 5: Performance Analyzer Module

- [ ] 24. Implement Performance Analyzer core
  - [ ] 24.1 Create PerformanceAnalyzer class
    - Integrate with LLMRouter for analysis
    - Implement `analyzeCode()` method for arbitrary code blocks
    - Implement `analyzeSelection()` for editor selections
    - Implement `analyzeCurrentFunction()` to extract and analyze current function
    - _Requirements: 4.6, 11.2, 11.3_
  
  - [ ] 24.2 Implement complexity detection
    - Create ComplexityDetector class with heuristics
    - Detect time complexity (best, average, worst case)
    - Detect space complexity (auxiliary and total)
    - Use pattern matching for common algorithms (loops, recursion, data structures)
    - _Requirements: 4.1, 4.2_
  
  - [ ] 24.3 Implement edge case identification
    - Create EdgeCaseIdentifier class
    - Identify scenarios causing performance degradation
    - Suggest mitigation strategies
    - _Requirements: 4.3_
  
  - [ ] 24.4 Implement optimization suggestions
    - Generate optimization recommendations with structured reasoning
    - Include expected improvement estimates
    - Explain tradeoffs for each optimization
    - _Requirements: 4.4_
  
  - [ ]* 24.5 Write property test for analysis completeness
    - **Property 8: Performance Analysis Completeness**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
    - Analyze random code blocks, verify all required sections present (time/space complexity, edge cases, optimizations)
  
  - [ ]* 24.6 Write property test for scope support
    - **Property 9: Performance Analysis Scope Support**
    - **Validates: Requirements 4.6**
    - Test with functions, methods, classes, code blocks, verify successful analysis without errors

- [ ] 25. Implement uncertainty reporting
  - [ ] 25.1 Add uncertainty detection
    - Detect when complexity cannot be determined with confidence
    - Report uncertainty with reasoning explaining why
    - Provide best-effort analysis with caveats
    - _Requirements: 4.5, 15.4_
  
  - [ ]* 25.2 Write property test for uncertainty reporting
    - **Property 31: Uncertainty Reporting**
    - **Validates: Requirements 15.4**
    - Test with ambiguous code, verify explicit uncertainty reporting with reasoning

- [ ] 26. Create output formatting
  - [ ] 26.1 Implement OutputFormatter class
    - Format analysis results for output panel display
    - Create structured sections for complexity, edge cases, optimizations
    - Include syntax highlighting for code examples
    - _Requirements: 4.5, 11.4_
  
  - [ ] 26.2 Create output panel integration
    - Register output channel for performance analysis
    - Display formatted results in panel
    - Add clear/refresh functionality

- [ ] 27. Register performance analysis command
  - [ ] 27.1 Create analyzePerformance.ts command handler
    - Register "Orbit: Analyze Performance" command
    - Handle selection, current function, or prompt user
    - Display results in output panel
    - _Requirements: 11.1, 11.4_
  
  - [ ] 27.2 Add keyboard shortcuts
    - Configure keyboard shortcut for quick access
    - Add to command palette
    - _Requirements: 11.5_

- [ ] 28. Write unit tests for Phase 5
  - [ ]* 28.1 Test complexity detection
    - Time complexity calculated correctly
    - Space complexity calculated correctly
    - Common patterns recognized
  
  - [ ]* 28.2 Test edge case identification
    - Edge cases identified for various algorithms
    - Mitigation strategies provided
  
  - [ ]* 28.3 Test optimization suggestions
    - Suggestions include structured reasoning
    - Expected improvements estimated
    - Tradeoffs explained
  
  - [ ]* 28.4 Test uncertainty reporting
    - Uncertainty reported when appropriate
    - Reasoning explains why unclear
  
  - [ ]* 28.5 Test command integration
    - Command available in palette
    - Works with selection
    - Works with current function
    - Results display in output panel

- [ ] 29. Checkpoint - Verify performance analysis works
  - Run analysis on various code samples
  - Test with functions, methods, classes
  - Verify complexity detection accuracy
  - Confirm uncertainty reporting
  - Test command and keyboard shortcuts
  - Ensure all tests pass, ask the user if questions arise


### Phase 6: Context Collector Enhancement

- [ ] 30. Implement Enhanced Context Collector
  - [ ] 30.1 Create EnhancedContextCollector class
    - Extend existing ContextGatherer from reviewContext.ts
    - Implement `collectContext()` for file and project scope
    - Gather open files, current selection, file structure
    - _Requirements: 8.1, 8.3_
  
  - [ ] 30.2 Implement prioritization algorithm
    - Create ContextPrioritizer class
    - Calculate priority scores: current file (100) + selection (50) + recently modified (30) + imported (20) + open (10)
    - Sort files by priority score
    - _Requirements: 8.5_
  
  - [ ]* 30.3 Write property test for prioritization order
    - **Property 15: Context Prioritization Order**
    - **Validates: Requirements 8.5**
    - Generate random file sets, verify prioritization follows defined order

- [ ] 31. Integrate Decision Journal with context
  - [ ] 31.1 Add past decisions to context
    - Query Decision Journal for recent decisions (last 10 for current file, last 5 for project)
    - Include decision reasoning in context
    - Associate decisions with relevant files
    - _Requirements: 5.5, 8.2_
  
  - [ ]* 31.2 Write property test for context includes past decisions
    - **Property 13: Context Includes Past Decisions**
    - **Validates: Requirements 5.5, 8.2**
    - Create decisions for files, collect context, verify decisions included

- [ ] 32. Implement import graph builder
  - [ ] 32.1 Create ImportGraphBuilder class
    - Parse import/require statements from files
    - Build graph of import relationships
    - Identify imported and exporting files
    - Cache graph and invalidate on file changes
    - _Requirements: 8.3_

- [ ] 33. Implement token estimation and truncation
  - [ ] 33.1 Create TokenEstimator class
    - Implement rough token estimation (chars / 4)
    - Calculate total tokens for collected context
    - _Requirements: 8.4_
  
  - [ ] 33.2 Implement context truncation
    - Truncate low-priority items first when exceeding limit
    - Preserve high-priority items (current selection, recently modified)
    - Log truncation events for debugging
    - _Requirements: 8.4, 15.5_
  
  - [ ]* 33.3 Write property test for token limit enforcement
    - **Property 14: Context Token Limit Enforcement**
    - **Validates: Requirements 8.4**
    - Generate large contexts, verify total tokens never exceed configured maximum
  
  - [ ]* 33.4 Write property test for truncation priority preservation
    - **Property 32: Context Truncation Priority Preservation**
    - **Validates: Requirements 15.5**
    - Generate contexts exceeding limits, verify high-priority items preserved before low-priority

- [ ] 34. Add multi-file context support
  - [ ] 34.1 Implement multi-file gathering
    - Collect context from multiple open files
    - Include import relationships
    - Respect token limits across all files
    - _Requirements: 8.6_

- [ ] 35. Write unit tests for Phase 6
  - [ ]* 35.1 Test context collection
    - Open files included
    - Current selection captured
    - File structure gathered
    - Past decisions retrieved
  
  - [ ]* 35.2 Test prioritization
    - Priority scores calculated correctly
    - Files sorted by priority
    - Current selection highest priority
  
  - [ ]* 35.3 Test token estimation and truncation
    - Token counts estimated accurately
    - Truncation preserves high-priority items
    - Limit never exceeded
  
  - [ ]* 35.4 Test import graph
    - Import statements parsed correctly
    - Graph built accurately
    - Cache invalidation works

- [ ] 36. Checkpoint - Verify context collection enhancement
  - Test context collection for single and multiple files
  - Verify prioritization algorithm
  - Test token limit enforcement
  - Confirm past decisions included
  - Test import graph building
  - Ensure all tests pass, ask the user if questions arise


### Phase 7: UI Components and Commands

- [ ] 37. Implement Decision History webview
  - [ ] 37.1 Create viewDecisionHistory.ts command handler
    - Register "Orbit: View Decision History" command
    - Query Decision Journal for recent decisions
    - Open webview panel with decision list
    - _Requirements: 12.1, 12.2_
  
  - [ ] 37.2 Create DecisionHistory.tsx React component
    - Display decision list with timestamps, files, descriptions
    - Show full structured reasoning for each decision
    - Implement filtering by file path
    - Implement filtering by date range
    - Add navigation to file/line on decision click
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6_
  
  - [ ] 37.3 Implement webview communication
    - Handle filter changes from UI
    - Handle navigation requests
    - Update decision list based on filters

- [ ] 38. Create StructuredReasoning reusable component
  - [ ] 38.1 Build StructuredReasoning.tsx component
    - Display all 5 sections (what, why, improvements, tradeoffs, production)
    - Support collapsible sections
    - Apply consistent styling
    - Preserve code blocks with syntax highlighting
    - _Requirements: 6.5, 6.6_

- [ ] 39. Finalize Diff Approval webview (from Phase 4)
  - [ ] 39.1 Polish DiffApproval.tsx component
    - Use StructuredReasoning component for reasoning display
    - Ensure side-by-side or unified diff view
    - Test hunk selection UI
    - Verify keyboard shortcuts (Enter/Escape)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

- [ ] 40. Register all commands
  - [ ] 40.1 Update commandRegistry.ts
    - Register "Orbit: View Decision History"
    - Register "Orbit: Analyze Performance"
    - Ensure existing commands still registered
    - _Requirements: 10.1, 11.1, 12.1_
  
  - [ ] 40.2 Configure keyboard shortcuts
    - Add shortcuts to package.json keybindings
    - Document shortcuts in README
    - _Requirements: 11.5, 13.6_

- [ ] 41. Update extension.ts activation
  - [ ] 41.1 Initialize new modules on activation
    - Initialize SQLiteMemory and Decision Journal
    - Initialize Enhanced Context Collector
    - Wrap providers with StructuredProvider
    - Register all new commands
    - _Requirements: 10.4_
  
  - [ ] 41.2 Add global error boundary
    - Wrap activation in try-catch
    - Log errors without crashing VS Code
    - Display error message to user
    - _Requirements: 15.6_
  
  - [ ]* 41.3 Write property test for error containment
    - **Property 33: Error Containment**
    - **Validates: Requirements 15.6**
    - Simulate internal errors in various modules, verify no VS Code crashes

- [ ] 42. Write unit tests for Phase 7
  - [ ]* 42.1 Test Decision History command
    - Command opens webview
    - Recent decisions displayed
    - Filtering works correctly
    - Navigation to file/line works
  
  - [ ]* 42.2 Test webview components
    - StructuredReasoning displays all sections
    - DecisionHistory filters and displays correctly
    - DiffApproval shows reasoning and diff
  
  - [ ]* 42.3 Test command registration
    - All commands available in palette
    - Keyboard shortcuts work
    - Existing commands still functional

- [ ] 43. Checkpoint - Verify all UI components work
  - Test Decision History webview with filtering
  - Test Diff Approval webview with hunk selection
  - Test Performance Analysis output panel
  - Verify all commands accessible
  - Test keyboard shortcuts
  - Ensure all tests pass, ask the user if questions arise


### Phase 8: Integration and Polish

- [ ] 44. End-to-end integration testing
  - [ ]* 44.1 Test complete chat flow
    - User initiates chat
    - Context collected with past decisions
    - Structured response generated and validated
    - Response displayed with all 5 sections
  
  - [ ]* 44.2 Test complete review flow
    - User requests code review
    - Context collected including file structure
    - Inline comments generated with structured reasoning
    - Comments appear at correct lines in editor
    - CodeLens shows "View Reasoning"
    - Accepted suggestions logged to Decision Journal
  
  - [ ]* 44.3 Test complete edit flow
    - User requests code edit
    - Diff generated with structured reasoning
    - Diff approval webview displays
    - User approves (full or partial)
    - Changes applied correctly
    - Decision logged to journal
  
  - [ ]* 44.4 Test complete performance analysis flow
    - User invokes "Analyze Performance"
    - Code analyzed for complexity
    - Results include time/space complexity, edge cases, optimizations
    - Results displayed in output panel with structured reasoning
  
  - [ ]* 44.5 Test decision journal integration
    - Decisions saved on edit approval
    - Decisions saved on review acceptance
    - Past decisions included in context for subsequent operations
    - Decision history viewable and filterable

- [ ] 45. Backward compatibility testing
  - [ ]* 45.1 Test existing command compatibility
    - **Property 21: Backward Compatibility of Commands**
    - **Validates: Requirements 10.1**
    - Execute all existing commands with same parameters, verify successful execution
  
  - [ ]* 45.2 Test provider interface stability
    - **Property 22: Provider Interface Stability**
    - **Validates: Requirements 10.2**
    - Verify existing AIProvider implementations satisfy interface without modification
  
  - [ ]* 45.3 Test configuration compatibility
    - **Property 23: Configuration Compatibility**
    - **Validates: Requirements 10.3**
    - Load existing configuration files, verify successful parsing and application
  
  - [ ]* 45.4 Test chat history compatibility
    - **Property 24: Chat History Compatibility**
    - **Validates: Requirements 10.6**
    - Load existing chat history data, verify successful loading without errors or data loss

- [ ] 46. Offline mode testing
  - [ ]* 46.1 Test offline feature availability
    - **Property 19: Offline Mode Feature Availability**
    - **Validates: Requirements 9.1, 9.4**
    - Activate LocalProvider, verify all core features available and functional
  
  - [ ]* 46.2 Test offline formatting consistency
    - **Property 20: Offline Mode Formatting Consistency**
    - **Validates: Requirements 9.2**
    - Generate responses through LocalProvider, verify identical structured format to OnlineProvider
  
  - [ ]* 46.3 Test offline graceful degradation
    - LocalProvider lacks structured output capability
    - Post-processing extracts structure
    - Fallback to raw output with warning if needed
    - _Requirements: 9.3_

- [ ] 47. Error handling verification
  - [ ]* 47.1 Test validation error handling
    - Response missing sections triggers regeneration
    - Max retries exhausted shows error with retry option
    - Never crashes or blocks workflow
    - _Requirements: 15.1_
  
  - [ ]* 47.2 Test database error handling (already tested in Phase 2)
    - **Property 29: Graceful Database Error Handling**
    - Database errors logged and operation continues
    - Non-blocking notifications displayed
  
  - [ ]* 47.3 Test unparseable output fallback
    - **Property 30: Unparseable Output Fallback**
    - **Validates: Requirements 15.3**
    - LLM output cannot be parsed after retries, raw output displayed with warning
  
  - [ ]* 47.4 Test context overflow handling
    - Context exceeds token limit
    - Truncation preserves high-priority items
    - Operation continues with truncated context
    - _Requirements: 15.5_
  
  - [ ]* 47.5 Test file system error handling
    - Permission denied on file write
    - File not found errors
    - Rollback partial changes
    - Clear error messages displayed

- [ ] 48. Performance optimization
  - [ ]* 48.1 Optimize database operations
    - Verify indexes used for queries
    - Cache prepared statements
    - Use read-only connections for queries
    - Measure query performance (< 10ms target)
  
  - [ ]* 48.2 Optimize context collection
    - Lazy load file content
    - Cache import graphs
    - Parallel file reads
    - Measure collection time (< 200ms for 10 files target)
  
  - [ ]* 48.3 Optimize response processing
    - Cache regex patterns
    - Parallel validation and rendering
    - Measure processing time (< 50ms target)
  
  - [ ]* 48.4 Optimize UI responsiveness
    - Async operations don't block
    - Progress indicators for long operations
    - Debounce rapid user input
    - Measure command activation (< 10ms target)

- [ ] 49. Update configuration schema
  - [ ] 49.1 Add new configuration options to package.json
    - orbit.reasoning.maxRetries (default: 3)
    - orbit.reasoning.fallbackToRaw (default: true)
    - orbit.context.maxTokens (default: 4000)
    - orbit.context.includeDecisions (default: true)
    - orbit.decisionJournal.enabled (default: true)
    - orbit.decisionJournal.maxHistoryItems (default: 10)
    - orbit.performance.showUncertainty (default: true)
    - _Requirements: 10.3_

- [ ] 50. Documentation updates
  - [ ]* 50.1 Update README.md
    - Document new features (structured reasoning, decision journal, performance analysis)
    - Add usage examples for new commands
    - Document configuration options
    - Add keyboard shortcuts reference
  
  - [ ]* 50.2 Create CHANGELOG.md entry
    - List all new features
    - Document breaking changes (none expected)
    - Note backward compatibility
  
  - [ ]* 50.3 Update inline code documentation
    - Add JSDoc comments to all public APIs
    - Document interfaces and types
    - Add usage examples in comments

- [ ] 51. Security review
  - [ ]* 51.1 Review database security
    - Verify database in .orbit directory
    - Check file permissions (user-only read/write)
    - Confirm no network access
    - Document .gitignore recommendation
  
  - [ ]* 51.2 Review API key handling
    - Verify no API keys in logs
    - Confirm masking in error messages
    - Check VS Code secrets API usage
  
  - [ ]* 51.3 Review injection attack prevention
    - Verify parameterized queries only
    - Check no eval() or dynamic code execution
    - Confirm webview content sanitization
    - Verify code blocks displayed as text

- [ ] 52. Final checkpoint - Complete integration verification
  - Run full test suite (unit + property tests)
  - Test all features end-to-end
  - Verify backward compatibility
  - Confirm offline mode works
  - Test error handling scenarios
  - Verify performance targets met
  - Review security considerations
  - Ensure documentation complete
  - All tests pass and system ready for release

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at phase boundaries
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- All 33 correctness properties from the design are covered by property-based tests
- Implementation uses TypeScript and integrates with existing VS Code extension architecture
- Backward compatibility maintained throughout - no breaking changes to existing workflows

