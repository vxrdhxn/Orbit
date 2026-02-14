# Implementation Plan: Orbit VS Code Extension

## Overview

This implementation plan breaks down the Orbit VS Code extension into incremental coding tasks. The extension will be built in TypeScript as a VS Code extension, implementing the dual-provider architecture with five core features (Chat, Explain, Search, Review, Edit) and graceful online/offline degradation.

The implementation follows this sequence:
1. Project setup and core infrastructure
2. Provider abstraction layer
3. Feature implementations (one at a time)
4. Semantic search and indexing
5. UI components and integration
6. Testing and validation

## Tasks

- [ ] 1. Set up VS Code extension project structure
  - Initialize TypeScript VS Code extension with proper configuration
  - Set up build tooling (webpack/esbuild)
  - Configure tsconfig.json with strict type checking
  - Set up testing framework (Jest + fast-check for property-based testing)
  - Create directory structure: src/providers, src/features, src/index, src/ui
  - _Requirements: 1.1, 1.4_

- [ ] 1.1 Write unit tests for project setup
  - Verify extension activates correctly
  - Verify all dependencies are properly installed
  - _Requirements: 1.1_

- [ ] 2. Implement AI Provider abstraction layer
  - [ ] 2.1 Define AIProvider interface and related types
    - Create interfaces: AIProvider, Message, Context, ChatResponse, ReviewComment, UnifiedDiff
    - Define ProviderHealth interface
    - _Requirements: 1.1, 1.4_

  - [ ] 2.2 Implement ProviderResolver class
    - Write provider selection logic with online-first preference
    - Implement getProvider() with automatic failover
    - Implement checkHealth() method
    - Add 500ms timeout for provider selection
    - _Requirements: 1.2, 1.3, 1.6_

  - [ ] 2.3 Write property test for provider selection prioritization
    - **Property 1: Provider Selection Prioritization**
    - **Validates: Requirements 1.2**

  - [ ] 2.4 Write property test for provider failover
    - **Property 2: Provider Failover**
    - **Validates: Requirements 1.3, 8.2**

  - [ ] 2.5 Write property test for provider selection performance
    - **Property 3: Provider Selection Performance**
    - **Validates: Requirements 1.6**

- [ ] 3. Implement Online Provider
  - [ ] 3.1 Create OnlineProvider class implementing AIProvider
    - Implement isAvailable() with health check endpoint
    - Implement chat() method with API calls
    - Implement explain() method
    - Implement review() method
    - Implement generateDiff() method
    - Add proper error handling and timeouts
    - _Requirements: 1.1, 1.2_

  - [ ] 3.2 Write unit tests for OnlineProvider
    - Test API endpoint construction
    - Test request headers and authentication
    - Test timeout handling
    - Test error responses
    - _Requirements: 1.1_

- [ ] 4. Implement Local Provider
  - [ ] 4.1 Create LocalProvider class implementing AIProvider
    - Implement isAvailable() checking Ollama service
    - Implement chat() with Ollama API format
    - Implement explain() method
    - Implement review() method
    - Implement generateDiff() method
    - Add message formatting for Ollama
    - _Requirements: 1.1, 1.3_

  - [ ] 4.2 Write unit tests for LocalProvider
    - Test Ollama endpoint connectivity
    - Test message formatting
    - Test response parsing
    - _Requirements: 1.1_

  - [ ] 4.3 Write example test for deterministic local behavior
    - Verify same input produces same output with LocalProvider
    - _Requirements: 2.4_

- [ ] 5. Checkpoint - Ensure provider layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement Chat Feature
  - [ ] 6.1 Create ChatFeature class
    - Implement sendMessage() using ProviderResolver
    - Implement chat history management
    - Add context gathering (active file + selection)
    - _Requirements: 2.1, 2.2, 2.5_

  - [ ] 6.2 Write property test for chat context inclusion
    - **Property 5: Chat Context Inclusion**
    - **Validates: Requirements 2.2**

  - [ ] 6.3 Write property test for chat always responds
    - **Property 6: Chat Always Responds**
    - **Validates: Requirements 2.5**

  - [ ] 6.4 Write property test for no intrusive UI during transitions
    - **Property 7: No Intrusive UI During Transitions**
    - **Validates: Requirements 2.7, 8.4, 8.5**

- [ ] 7. Implement Explain Feature
  - [ ] 7.1 Create ExplainFeature class
    - Implement explain() method using ProviderResolver
    - Add fallback logic for empty selection (use full file)
    - Add 10-second timeout
    - _Requirements: 3.1, 3.2, 3.5, 3.6_

  - [ ] 7.2 Write property test for explanation generation
    - **Property 8: Explanation Generation**
    - **Validates: Requirements 3.2, 3.5**

  - [ ] 7.3 Write property test for explain fallback to full file
    - **Property 9: Explain Fallback to Full File**
    - **Validates: Requirements 3.6**

- [ ] 8. Implement Review Feature
  - [ ] 8.1 Create ReviewFeature class
    - Implement review() method using ProviderResolver
    - Ensure only active file content is passed
    - Format output as ReviewComment array
    - Exclude severity levels from output
    - _Requirements: 5.1, 5.2, 5.3, 5.6, 5.7_

  - [ ] 8.2 Write property test for review scope
    - **Property 14: Review Scope Limited to Active File**
    - **Validates: Requirements 5.2, 5.6**

  - [ ] 8.3 Write property test for review output format
    - **Property 15: Review Output Has No Severity**
    - **Validates: Requirements 5.7**

- [ ] 9. Implement Edit Feature
  - [ ] 9.1 Create EditFeature class
    - Implement generateEdit() using ProviderResolver
    - Validate unified diff format output
    - Implement applyDiff() with explicit approval requirement
    - Add safety checks to prevent auto-application
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.7_

  - [ ] 9.2 Write property test for diff format validation
    - **Property 16: Edit Generates Valid Diff**
    - **Validates: Requirements 6.2**

  - [ ] 9.3 Write property test for code modification safety
    - **Property 17: Code Modification Safety**
    - **Validates: Requirements 6.3, 6.7, 10.1, 10.4**

  - [ ] 9.4 Write property test for diff approval requirement
    - **Property 18: Diff Requires Approval**
    - **Validates: Requirements 6.4**

  - [ ] 9.5 Write property test for change presentation
    - **Property 23: Change Presentation Before Application**
    - **Validates: Requirements 10.2**

- [ ] 10. Checkpoint - Ensure feature tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement Semantic Search and Indexing
  - [ ] 11.1 Create EmbeddingGenerator class
    - Implement generate() using LocalProvider
    - Add caching for repeated text
    - _Requirements: 4.2_

  - [ ] 11.2 Create SemanticIndex class
    - Implement add() for adding entries
    - Implement search() with cosine similarity
    - Implement save() and load() for persistence
    - Add top-K result limiting
    - _Requirements: 4.2, 4.3, 4.8_

  - [ ] 11.3 Create SemanticSearchFeature class
    - Implement buildIndex() for workspace scanning
    - Implement search() method
    - Add code chunking logic
    - Ensure no navigation or modification side effects
    - _Requirements: 4.1, 4.3, 4.4, 4.6, 4.7_

  - [ ] 11.4 Write property test for search result count
    - **Property 10: Search Returns Top-K Results**
    - **Validates: Requirements 4.3**

  - [ ] 11.5 Write property test for offline search
    - **Property 11: Search Works Offline**
    - **Validates: Requirements 4.4**

  - [ ] 11.6 Write property test for search no navigation
    - **Property 12: Search Does Not Navigate**
    - **Validates: Requirements 4.6**

  - [ ] 11.7 Write property test for search no modification
    - **Property 13: Search Does Not Modify Code**
    - **Validates: Requirements 4.7**

  - [ ] 11.8 Write unit tests for cosine similarity
    - Test with known vectors
    - Test edge cases (zero vectors, identical vectors)
    - _Requirements: 4.3_

  - [ ] 11.9 Write example test for index persistence
    - Build index, save, load, verify contents
    - _Requirements: 4.8_

- [ ] 12. Implement Health Check Feature
  - [ ] 12.1 Create HealthCheckFeature class
    - Implement checkHealth() gathering all status information
    - Add 2-second timeout
    - Format output with provider statuses and index status
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ] 12.2 Write property test for health check performance
    - **Property 19: Health Check Performance**
    - **Validates: Requirements 7.6**

  - [ ] 12.3 Write example tests for health check output
    - Verify all required fields present
    - _Requirements: 7.2, 7.3, 7.4, 7.5_

- [ ] 13. Implement VS Code Commands
  - [ ] 13.1 Register all commands in extension activation
    - Register "Orbit: Explain Selection"
    - Register "Orbit: Search Codebase"
    - Register "Orbit: Review Code"
    - Register "Orbit: Edit Code"
    - Register "Orbit: Health Check"
    - Wire commands to feature implementations
    - _Requirements: 3.1, 4.1, 5.1, 6.1, 7.1_

  - [ ] 13.2 Write property test for command availability
    - **Property 20: Commands Available During Network Loss**
    - **Validates: Requirements 8.1, 9.5**

  - [ ] 13.3 Write property test for command interface consistency
    - **Property 22: Command Interface Consistency**
    - **Validates: Requirements 9.1, 9.2**

  - [ ] 13.4 Write example tests for command registration
    - Verify each command is registered
    - Verify command names are correct
    - _Requirements: 3.1, 4.1, 5.1, 6.1, 7.1_

- [ ] 14. Implement Chat UI (Sidebar Webview)
  - [ ] 14.1 Create chat webview panel
    - Set up webview with HTML/CSS/JS
    - Implement message display
    - Implement input field
    - Add subtle status indicator
    - Wire to ChatFeature
    - _Requirements: 2.1, 2.6_

  - [ ] 14.2 Write integration tests for chat UI
    - Test message sending and receiving
    - Test context gathering
    - _Requirements: 2.1, 2.2_

- [ ] 15. Implement provider transition handling
  - [ ] 15.1 Add automatic provider switching on connectivity changes
    - Monitor network connectivity
    - Trigger provider re-selection on changes
    - Update status indicator
    - _Requirements: 8.2, 8.3_

  - [ ] 15.2 Write property test for provider recovery
    - **Property 21: Provider Recovery on Reconnection**
    - **Validates: Requirements 8.3**

- [ ] 16. Implement modification logging and audit trail
  - [ ] 16.1 Create modification logger
    - Log all code changes with timestamps
    - Log user approval actions
    - Store logs persistently
    - _Requirements: 10.5_

  - [ ] 16.2 Write property test for modification audit trail
    - **Property 24: Modification Audit Trail**
    - **Validates: Requirements 10.5**

- [ ] 17. Implement error handling
  - [ ] 17.1 Add error handling for all failure scenarios
    - Provider unavailability errors
    - Network timeout handling
    - Ollama service down handling
    - Invalid API key handling
    - Malformed response handling
    - Index corruption handling
    - _Requirements: All requirements (error handling)_

  - [ ] 17.2 Write unit tests for error scenarios
    - Test each error type
    - Verify user-friendly error messages
    - Verify no unhandled exceptions
    - _Requirements: All requirements_

- [ ] 18. Implement configuration management
  - [ ] 18.1 Add VS Code settings for Orbit
    - Online API endpoint configuration
    - Online API key configuration
    - Ollama endpoint configuration
    - Ollama model selection
    - Preference for online/local
    - _Requirements: 1.2, 1.3_

  - [ ] 18.2 Write unit tests for configuration
    - Test default values
    - Test configuration loading
    - _Requirements: 1.2, 1.3_

- [ ] 19. Checkpoint - Integration testing
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 20. Write property test for command behavior consistency
  - **Property 4: Command Behavior Consistency**
  - **Validates: Requirements 1.5**

- [ ] 21. Write integration tests for end-to-end workflows
  - Test chat message flow
  - Test explain flow
  - Test search flow
  - Test review flow
  - Test edit and apply flow
  - Test network disconnect scenario
  - _Requirements: All requirements_

- [ ] 22. Final checkpoint - Complete testing and validation
  - Run all unit tests
  - Run all property tests (100 iterations each)
  - Run integration tests
  - Verify all requirements are met
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties with 100+ iterations
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end workflows
- Checkpoints ensure incremental validation throughout development
