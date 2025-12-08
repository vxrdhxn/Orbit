# Implementation Plan

- [ ] 1. Set up core file reference infrastructure
  - Create FileReferenceParser class with syntax detection for backticks, hash prefix, and plain text
  - Create FileContentReader class with size checking and content reading
  - Create FileReferenceManager class for recent files tracking
  - Set up test infrastructure with fast-check for property-based testing
  - _Requirements: 1.1, 1.2, 4.1, 4.2, 4.3_

- [ ] 1.1 Write property test for file reference detection
  - **Property 1: File reference detection accuracy**
  - **Validates: Requirements 1.1, 4.1, 4.2**

- [ ] 1.2 Write property test for path separator normalization
  - **Property 8: Path separator normalization**
  - **Validates: Requirements 4.5**

- [ ] 2. Implement file path resolution and validation
  - Implement path resolution for relative paths from workspace root
  - Implement unique filename resolution across workspace
  - Add file existence validation
  - Add path traversal security checks
  - _Requirements: 1.2, 4.3, 4.4, 4.5_

- [ ] 2.1 Write property test for file existence validation
  - **Property 2: File existence validation consistency**
  - **Validates: Requirements 1.2**

- [ ] 2.2 Write property test for relative path resolution
  - **Property 9: Relative path resolution**
  - **Validates: Requirements 4.3**

- [ ] 2.3 Write property test for unique filename resolution
  - **Property 10: Unique filename resolution**
  - **Validates: Requirements 4.4**

- [ ] 3. Implement file content reading with size limits
  - Add file size checking before reading
  - Implement size limit warnings (100KB) and confirmations (500KB)
  - Add full file reading functionality
  - Implement error handling for file system errors
  - _Requirements: 1.3, 5.1, 5.2, 5.3_

- [ ] 3.1 Write property test for context size limit enforcement
  - **Property 11: Context size limit enforcement**
  - **Validates: Requirements 5.3**

- [ ] 4. Add line range support
  - Implement line range syntax parsing (single line, range, open-ended)
  - Add line range validation
  - Implement partial file reading by line range
  - Add error handling for invalid line ranges
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 4.1 Write property test for line range parsing
  - **Property 13: Line range parsing correctness**
  - **Validates: Requirements 6.1, 6.4**

- [ ] 4.2 Write property test for partial file reading
  - **Property 12: Partial file reading accuracy**
  - **Validates: Requirements 5.5, 6.2**

- [ ] 4.3 Write property test for invalid line range handling
  - **Property 14: Invalid line range error handling**
  - **Validates: Requirements 6.3**

- [ ] 4.4 Write property test for full file reading default
  - **Property 15: Full file reading default**
  - **Validates: Requirements 6.5**

- [ ] 5. Extend ChatProvider to process file references
  - Add processFileReferences method to ChatProvider
  - Integrate file reference parsing into message handling
  - Build file context string with file contents
  - Add file reference validation and error notifications
  - Update message protocol with new message types
  - _Requirements: 1.3, 1.4, 1.5_

- [ ] 5.1 Write property test for valid file content inclusion
  - **Property 3: Valid file content inclusion**
  - **Validates: Requirements 1.3, 1.5**

- [ ] 5.2 Write property test for invalid file error notification
  - **Property 4: Invalid file error notification**
  - **Validates: Requirements 1.4**

- [ ] 6. Implement recent files tracking
  - Add recent files storage to FileReferenceManager
  - Implement add/get/clear operations for recent files
  - Add recent files ordering by usage
  - Implement 20-entry limit with LRU eviction
  - Add persistence across chat sessions
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 6.1 Write property test for recent files list maintenance
  - **Property 16: Recent files list maintenance**
  - **Validates: Requirements 7.1, 7.3**

- [ ] 6.2 Write property test for recent files ordering
  - **Property 17: Recent files ordering**
  - **Validates: Requirements 7.2**

- [ ] 6.3 Write property test for recent files size limit
  - **Property 18: Recent files list size limit**
  - **Validates: Requirements 7.5**

- [ ] 6.4 Write property test for recent files persistence
  - **Property 19: Recent files persistence**
  - **Validates: Requirements 7.4**

- [ ] 7. Create file reference UI components
  - Create FileReferenceIndicator component for highlighting references in input
  - Add file reference detection in InputArea component
  - Implement visual indicators for valid/invalid references
  - Add hover tooltips with file information
  - _Requirements: 1.1, 3.1, 3.4_

- [ ] 7.1 Write unit tests for FileReferenceIndicator component
  - Test rendering with valid and invalid references
  - Test tooltip display on hover
  - Test remove functionality
  - _Requirements: 1.1, 3.1, 3.4_

- [ ] 8. Implement file picker component
  - Create FilePicker React component
  - Add file search and filtering functionality
  - Display recent files at the top
  - Implement file selection and insertion into input
  - Add keyboard navigation support
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 8.1 Write property test for file picker filtering
  - **Property 5: File picker filtering correctness**
  - **Validates: Requirements 2.4**

- [ ] 8.2 Write property test for relative path display
  - **Property 6: Relative path display consistency**
  - **Validates: Requirements 2.5, 2.3**

- [ ] 8.3 Write unit tests for FilePicker component
  - Test file list rendering
  - Test search functionality
  - Test file selection
  - Test keyboard navigation
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 9. Add file context preview component
  - Create FileContextPreview component
  - Display list of files included in context
  - Show file metadata (size, type, line count)
  - Add toggle functionality to include/exclude files
  - Implement file content preview on expand
  - _Requirements: 3.2, 3.3, 3.5_

- [ ] 9.1 Write property test for file metadata accuracy
  - **Property 7: File metadata accuracy**
  - **Validates: Requirements 3.5**

- [ ] 9.2 Write unit tests for FileContextPreview component
  - Test file list rendering
  - Test metadata display
  - Test toggle functionality
  - Test preview expansion
  - _Requirements: 3.2, 3.3, 3.5_

- [ ] 10. Wire up file picker to ChatProvider
  - Add handleFilePicker method to ChatProvider
  - Implement openFilePicker message handler
  - Add insertFileReference message handler
  - Connect file picker button in InputArea
  - Update webview message protocol
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 11. Integrate file context preview into chat flow
  - Add file context preview display before sending message
  - Implement toggleFileInContext message handler
  - Show file summary after message is sent
  - Add file reference indicators in message display
  - _Requirements: 3.1, 3.2_

- [ ] 12. Add error handling and user feedback
  - Implement error notifications for file not found
  - Add warnings for large files (100KB, 500KB)
  - Implement confirmation dialogs for large files
  - Add disambiguation UI for ambiguous file references
  - Implement context overflow handling with prioritization
  - _Requirements: 1.4, 5.1, 5.2, 5.3, 5.4_

- [ ] 12.1 Write unit tests for error handling
  - Test file not found errors
  - Test permission denied errors
  - Test large file warnings
  - Test ambiguous reference handling
  - Test context overflow handling
  - _Requirements: 1.4, 5.1, 5.2, 5.3, 5.4_

- [ ] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Add performance optimizations
  - Implement lazy file reading (only on message send)
  - Add file content caching with invalidation on file change
  - Implement debouncing for file reference validation
  - Add workspace file change listeners for cache invalidation
  - _Requirements: All_

- [ ] 14.1 Write performance tests
  - Test file reading performance with various file sizes
  - Test cache hit/miss scenarios
  - Test debouncing behavior
  - _Requirements: All_

- [ ] 15. Final polish and accessibility
  - Add keyboard shortcuts for file picker (e.g., Ctrl+Shift+O)
  - Implement screen reader announcements for file references
  - Ensure high contrast theme support
  - Add focus management for file picker
  - Implement file reference auto-completion suggestions
  - _Requirements: All_

- [ ] 15.1 Write accessibility tests
  - Test keyboard navigation
  - Test screen reader compatibility
  - Test high contrast theme rendering
  - Test focus management
  - _Requirements: All_

- [ ] 16. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
