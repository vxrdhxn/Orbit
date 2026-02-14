# Implementation Plan

- [ ] 1. Set up core types and data structures
  - Create `reviewTypes.ts` with all interfaces (ReviewReport, Finding, SeverityLevel, etc.)
  - Define enums for FindingCategory, SeverityLevel, QualityLevel, ReviewScope
  - Create configuration interface for review settings
  - _Requirements: 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 1.1 Write property test for finding structure validity
  - **Property 2: Finding structure validity**
  - **Validates: Requirements 2.5, 3.1, 3.2, 3.3**

- [ ] 1.2 Write property test for fix structure validity
  - **Property 5: Fix structure validity**
  - **Validates: Requirements 3.5**

- [ ] 1.3 Write property test for summary structure validity
  - **Property 8: Summary structure validity**
  - **Validates: Requirements 10.1, 10.2, 10.3**

- [ ] 2. Implement ReviewService core logic
  - Create `reviewService.ts` with ReviewService class
  - Implement `reviewCode()` method to orchestrate review flow
  - Implement `buildPrompt()` to construct Ollama prompts with code and context
  - Implement `parseResponse()` to parse JSON responses from Ollama into ReviewReport
  - Add error handling for malformed responses and timeouts
  - _Requirements: 2.5, 3.1, 3.2, 3.3, 3.4, 5.1, 5.5_

- [ ] 2.1 Write property test for localhost-only communication
  - **Property 1: Localhost-only communication**
  - **Validates: Requirements 5.1, 5.2, 5.4**

- [ ] 2.2 Write property test for configuration model usage
  - **Property 7: Configuration model usage**
  - **Validates: Requirements 5.5**

- [ ] 2.3 Write unit tests for prompt building
  - Test prompt construction with code and context
  - Test prompt construction without context
  - Test handling of different languages

- [ ] 2.4 Write unit tests for response parsing
  - Test valid JSON response parsing
  - Test malformed JSON handling
  - Test empty findings handling

- [ ] 3. Implement ContextGatherer for project context
  - Create `reviewContext.ts` with ContextGatherer class
  - Implement `gatherContext()` to query the existing SimpleIndex
  - Implement `findSimilarPatterns()` to search for similar code
  - Implement `detectNamingConventions()` to identify project patterns
  - Handle gracefully when index is unavailable
  - _Requirements: 7.1, 7.5_

- [ ] 3.1 Write property test for index integration
  - **Property 11: Index integration**
  - **Validates: Requirements 7.1**

- [ ] 3.2 Write property test for graceful index degradation
  - **Property 12: Graceful index degradation**
  - **Validates: Requirements 7.5**

- [ ] 3.3 Write unit tests for context gathering
  - Test index query construction
  - Test pattern detection
  - Test handling of missing index

- [ ] 4. Implement ReviewFormatter for output display
  - Create `reviewFormatter.ts` with ReviewFormatter class
  - Implement `formatReport()` to convert ReviewReport to markdown
  - Implement `formatSummary()` to create summary section with counts and quality
  - Implement `formatFinding()` to format individual findings with syntax highlighting
  - Implement `formatSuggestedFix()` to display fixes with diff previews
  - Add collapsible sections for findings grouped by severity
  - _Requirements: 3.4, 4.2, 10.1, 10.2, 10.3_

- [ ] 4.1 Write property test for finding severity ordering
  - **Property 4: Finding severity ordering**
  - **Validates: Requirements 3.4**

- [ ] 4.2 Write property test for formatted output contains markdown
  - **Property 6: Formatted output contains markdown**
  - **Validates: Requirements 4.2**

- [ ] 4.3 Write property test for action buttons for fixes
  - **Property 20: Action buttons for fixes**
  - **Validates: Requirements 8.1**

- [ ] 4.4 Write unit tests for formatting
  - Test markdown generation
  - Test syntax highlighting insertion
  - Test collapsible section creation

- [ ] 5. Implement command registration and scope detection
  - Create `reviewCommand.ts` with runReviewCommand function
  - Implement ReviewScope enum (Selection, CurrentFile, OpenFiles)
  - Implement scope detection logic (selection vs full file vs multiple files)
  - Register commands in `extension.ts`: context menu, command palette
  - Add command to package.json contributions
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 5.1 Write property test for scope selection correctness
  - **Property 3: Scope selection correctness**
  - **Validates: Requirements 1.2, 1.3**

- [ ] 5.2 Write property test for multiple file input handling
  - **Property 19: Multiple file input handling**
  - **Validates: Requirements 1.5**

- [ ] 5.3 Write unit tests for scope detection
  - Test selection vs full file detection
  - Test empty selection handling
  - Test multi-file scope handling

- [ ] 6. Integrate review with ChatProvider
  - Modify `ChatProvider.ts` to handle review results
  - Add message type for displaying review reports
  - Implement clickable findings that navigate to code locations
  - Add support for follow-up questions about findings
  - Display progress indicators during review
  - _Requirements: 4.1, 4.3, 4.4, 9.3_

- [ ] 7. Implement configuration system
  - Add review settings to package.json configuration section
  - Create config interface in `reviewTypes.ts`
  - Implement config reading in ReviewService
  - Add category filtering based on enabled categories
  - Add severity threshold filtering
  - Support hot-reload of configuration changes
  - _Requirements: 6.1, 6.2, 6.3, 6.5_

- [ ] 7.1 Write property test for configuration filtering
  - **Property 9: Configuration filtering**
  - **Validates: Requirements 6.3**

- [ ] 7.2 Write property test for category filtering
  - **Property 21: Category filtering**
  - **Validates: Requirements 6.2**

- [ ] 7.3 Write property test for configuration hot-reload
  - **Property 10: Configuration hot-reload**
  - **Validates: Requirements 6.5**

- [ ] 7.4 Write unit tests for configuration
  - Test config reading and defaults
  - Test category filtering
  - Test severity threshold filtering

- [ ] 8. Implement FixApplicator for applying suggested fixes
  - Create `reviewFixes.ts` with FixApplicator class
  - Implement `applyFix()` to apply single fix with diff preview
  - Implement `applyMultipleFixes()` for batch fix application
  - Implement `showDiffPreview()` using existing DiffContentProvider
  - Add conflict detection for file modifications
  - Handle user approval/rejection of fixes
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 8.1 Write property test for fix application correctness
  - **Property 13: Fix application correctness**
  - **Validates: Requirements 8.3**

- [ ] 8.2 Write property test for batch fix application
  - **Property 14: Batch fix application**
  - **Validates: Requirements 8.4**

- [ ] 9. Add webview message handlers for fix actions
  - Add message handler in ChatProvider for 'applyFix' action
  - Add message handler for 'applyBatchFixes' action
  - Add message handler for 'navigateToFinding' action
  - Update webview UI to send these messages when buttons clicked
  - _Requirements: 4.3, 8.2_

- [ ] 10. Implement performance optimizations
  - Add concurrent processing for multiple files using Promise.all
  - Implement file sectioning for files over 2000 lines
  - Add cancellation support with AbortController
  - Implement progress reporting during long reviews
  - Add timeout handling (default 60 seconds)
  - _Requirements: 9.2, 9.3, 9.4, 9.5_

- [ ] 10.1 Write property test for multi-file concurrent processing
  - **Property 15: Multi-file concurrent processing**
  - **Validates: Requirements 9.2**

- [ ] 10.2 Write property test for large file handling
  - **Property 16: Large file handling**
  - **Validates: Requirements 9.4**

- [ ] 10.3 Write property test for cancellation cleanup
  - **Property 17: Cancellation cleanup**
  - **Validates: Requirements 9.5**

- [ ] 11. Implement multi-file summary support
  - Extend ReviewReport to support per-file summaries
  - Modify ReviewService to generate per-file summaries for multi-file reviews
  - Update ReviewFormatter to display per-file summaries
  - Add overall summary aggregation across all files
  - _Requirements: 10.5_

- [ ] 11.1 Write property test for multi-file summary structure
  - **Property 18: Multi-file summary structure**
  - **Validates: Requirements 10.5**

- [ ] 12. Add error handling and edge cases
  - Implement Ollama unavailable error handling with clear messages
  - Add model not found error with pull instructions
  - Handle invalid code input (empty selection, no file)
  - Add timeout error handling with partial results
  - Implement file modification conflict detection
  - Add concurrent review limit (max 3)
  - _Requirements: 5.3, 8.5_

- [ ] 12.1 Write unit tests for error handling
  - Test Ollama unavailable handling
  - Test invalid input handling
  - Test timeout handling
  - Test conflict detection

- [ ] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
