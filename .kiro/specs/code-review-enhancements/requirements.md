# Requirements Document

## Introduction

This document specifies requirements for enhancing the DevMind code review feature with three key capabilities: inline code annotations, intelligent review presets, and git diff-based reviews. These enhancements transform the code review experience from a report-based workflow to an integrated, context-aware system that provides visual feedback directly in the editor and focuses on what matters most—recent changes.

## Glossary

- **Code Review System**: The existing component that analyzes code and provides feedback
- **Review Annotation**: Visual decoration in the editor showing review findings inline
- **Review Preset**: A predefined configuration optimizing review focus for specific scenarios
- **Diff-Based Review**: Analysis focused exclusively on changed lines from git diff
- **Decoration**: VS Code API feature for adding visual elements to editor text
- **CodeLens**: Clickable inline command displayed above code blocks
- **Gutter Icon**: Visual indicator in the editor's left margin
- **Severity Level**: Classification of finding importance (critical, warning, info, suggestion)
- **Finding**: An individual issue, suggestion, or observation identified during review
- **Git Working Tree**: The current state of files with uncommitted changes
- **Hunk**: A contiguous block of changed lines in a git diff

## Requirements

### Requirement 1: Inline Code Annotations

**User Story:** As a developer, I want to see review findings displayed directly in my code editor with visual decorations, so that I can understand issues in context without switching to a separate report.

#### Acceptance Criteria

1. WHEN the Code Review System completes analysis, THEN the Code Review System SHALL create editor decorations for each finding at the corresponding line numbers
2. WHEN displaying a critical finding, THEN the Code Review System SHALL render a red wavy underline beneath the problematic code
3. WHEN displaying a warning finding, THEN the Code Review System SHALL render a yellow wavy underline beneath the problematic code
4. WHEN displaying an info or suggestion finding, THEN the Code Review System SHALL render a blue wavy underline beneath the problematic code
5. WHEN a user hovers over an annotated code region, THEN the Code Review System SHALL display a tooltip containing the finding title, description, and severity level
6. WHEN a finding has a suggested fix, THEN the tooltip SHALL include a clickable "Apply Fix" action
7. WHEN a user clicks "Apply Fix" in a tooltip, THEN the Code Review System SHALL apply the suggested fix to the document
8. WHEN the user edits annotated code, THEN the Code Review System SHALL remove decorations for that line
9. WHEN the user closes a file, THEN the Code Review System SHALL persist annotations so they reappear when the file is reopened
10. WHEN multiple findings exist on the same line, THEN the tooltip SHALL display all findings for that line

### Requirement 2: Gutter Icons and CodeLens

**User Story:** As a developer, I want visual indicators in the editor gutter and inline CodeLens commands, so that I can quickly identify reviewed code and trigger actions without using menus.

#### Acceptance Criteria

1. WHEN a line contains a critical finding, THEN the Code Review System SHALL display a red error icon in the editor gutter
2. WHEN a line contains a warning finding, THEN the Code Review System SHALL display a yellow warning icon in the editor gutter
3. WHEN a line contains an info or suggestion finding, THEN the Code Review System SHALL display a blue info icon in the editor gutter
4. WHEN a user clicks a gutter icon, THEN the Code Review System SHALL display the finding details in a hover tooltip
5. WHEN a function or class has review findings, THEN the Code Review System SHALL display a CodeLens above the declaration showing the count of findings
6. WHEN a user clicks the findings count CodeLens, THEN the Code Review System SHALL navigate to the first finding in that scope
7. WHEN a file has been reviewed, THEN the Code Review System SHALL display a CodeLens at the top of the file with options to "Review Again" or "Clear Annotations"

### Requirement 3: Review Presets

**User Story:** As a developer, I want to select from predefined review configurations optimized for different scenarios, so that I can get relevant feedback without manually configuring settings each time.

#### Acceptance Criteria

1. WHEN a user triggers a code review, THEN the Code Review System SHALL offer a selection of review presets before starting analysis
2. WHEN the "Quick Check" preset is selected, THEN the Code Review System SHALL analyze only critical and warning severity issues with a focus on bugs and security
3. WHEN the "Pre-Commit" preset is selected, THEN the Code Review System SHALL analyze critical issues only and complete within 5 seconds for files under 500 lines
4. WHEN the "Deep Review" preset is selected, THEN the Code Review System SHALL analyze all severity levels and all categories with detailed explanations
5. WHEN the "Refactoring" preset is selected, THEN the Code Review System SHALL focus on maintainability, code smells, and best practices while ignoring style issues
6. WHEN the "Security Audit" preset is selected, THEN the Code Review System SHALL analyze only security-related findings with detailed vulnerability explanations
7. WHEN the "Performance" preset is selected, THEN the Code Review System SHALL focus on performance issues, inefficient algorithms, and optimization opportunities
8. WHEN the "Learning Mode" preset is selected, THEN the Code Review System SHALL include educational explanations and examples for each finding
9. WHERE a user has configured a default preset in settings, the Code Review System SHALL use that preset without prompting
10. WHEN a preset is selected, THEN the Code Review System SHALL display the preset name in the review report header

### Requirement 4: Preset Configuration

**User Story:** As a developer, I want to customize existing presets or create my own, so that I can tailor the review process to my specific project needs.

#### Acceptance Criteria

1. WHERE the user accesses settings, the Code Review System SHALL provide configuration for each preset including enabled categories and severity thresholds
2. WHEN a user modifies a preset configuration, THEN the Code Review System SHALL save the changes and apply them to subsequent reviews using that preset
3. WHEN a user creates a custom preset, THEN the Code Review System SHALL allow naming the preset and configuring all review parameters
4. WHEN a user selects a custom preset, THEN the Code Review System SHALL apply the custom configuration to the review
5. WHERE a preset configuration is invalid, the Code Review System SHALL display a validation error and prevent saving

### Requirement 5: Diff-Based Review Trigger

**User Story:** As a developer, I want to review only the lines I've changed since the last commit, so that I can quickly validate my work before committing without reviewing unchanged code.

#### Acceptance Criteria

1. WHEN a user invokes "Review Uncommitted Changes", THEN the Code Review System SHALL analyze only lines modified in the git working tree
2. WHEN a user invokes "Review Staged Changes", THEN the Code Review System SHALL analyze only lines in the git staging area
3. WHEN a user invokes "Review Branch Changes", THEN the Code Review System SHALL prompt for a base branch and analyze only lines changed compared to that branch
4. WHEN no git repository is detected, THEN the Code Review System SHALL display an error message and disable diff-based review commands
5. WHEN no changes are detected, THEN the Code Review System SHALL display a message indicating there are no changes to review

### Requirement 6: Diff Context Analysis

**User Story:** As a developer, I want the review to understand the context around my changes, so that suggestions consider how my changes interact with surrounding code.

#### Acceptance Criteria

1. WHEN analyzing a changed line, THEN the Code Review System SHALL include 5 lines of context before and after the change in the analysis
2. WHEN a change affects a function signature, THEN the Code Review System SHALL include the entire function body in the analysis
3. WHEN a change adds a new function or class, THEN the Code Review System SHALL analyze the entire new declaration
4. WHEN analyzing changes, THEN the Code Review System SHALL identify if changes break existing patterns in unchanged code
5. WHERE context lines contain relevant information, the Code Review System SHALL reference them in finding explanations

### Requirement 7: Diff-Based Review Display

**User Story:** As a developer, I want to see which findings apply to my changes versus existing code, so that I can focus on issues I introduced.

#### Acceptance Criteria

1. WHEN displaying diff-based review results, THEN the Code Review System SHALL clearly indicate which findings are in changed lines versus context lines
2. WHEN a finding is in a changed line, THEN the Code Review System SHALL mark it as "Introduced in this change"
3. WHEN a finding is in a context line, THEN the Code Review System SHALL mark it as "Pre-existing issue"
4. WHEN displaying the review summary, THEN the Code Review System SHALL show separate counts for new issues versus pre-existing issues
5. WHERE a change fixes a pre-existing issue, the Code Review System SHALL highlight this as a positive improvement

### Requirement 8: Git Integration

**User Story:** As a developer, I want the review system to integrate seamlessly with my git workflow, so that I can review changes at different stages of my commit process.

#### Acceptance Criteria

1. WHEN the Code Review System detects git, THEN the Code Review System SHALL query git status to identify changed files
2. WHEN analyzing uncommitted changes, THEN the Code Review System SHALL use git diff to identify changed line ranges
3. WHEN analyzing staged changes, THEN the Code Review System SHALL use git diff --staged to identify changed line ranges
4. WHEN comparing branches, THEN the Code Review System SHALL use git diff with the specified base branch
5. WHEN git operations fail, THEN the Code Review System SHALL display a clear error message and fall back to full file review

### Requirement 9: Annotation Persistence

**User Story:** As a developer, I want review annotations to persist across editor sessions, so that I don't lose review feedback when I close and reopen files.

#### Acceptance Criteria

1. WHEN the Code Review System creates annotations, THEN the Code Review System SHALL store annotation data in workspace storage
2. WHEN a user reopens a previously reviewed file, THEN the Code Review System SHALL restore all annotations from storage
3. WHEN a user explicitly clears annotations, THEN the Code Review System SHALL remove them from storage
4. WHEN a file is modified externally, THEN the Code Review System SHALL invalidate stored annotations for changed lines
5. WHERE annotations become stale after 7 days, the Code Review System SHALL automatically remove them from storage

### Requirement 10: Annotation Management

**User Story:** As a developer, I want to control which annotations are displayed and easily clear them, so that I can manage visual clutter in my editor.

#### Acceptance Criteria

1. WHEN a user invokes "Clear All Annotations", THEN the Code Review System SHALL remove all decorations from all open files
2. WHEN a user invokes "Clear Annotations in File", THEN the Code Review System SHALL remove decorations only from the active file
3. WHEN a user invokes "Hide Annotations", THEN the Code Review System SHALL hide decorations without removing the underlying data
4. WHEN a user invokes "Show Annotations", THEN the Code Review System SHALL restore hidden decorations
5. WHERE a user configures annotation display preferences, the Code Review System SHALL respect those preferences for all reviews

### Requirement 11: Performance Optimization

**User Story:** As a developer, I want diff-based reviews to complete quickly even for large changesets, so that the feature remains practical for frequent use.

#### Acceptance Criteria

1. WHEN reviewing uncommitted changes under 200 lines, THEN the Code Review System SHALL complete analysis within 3 seconds
2. WHEN reviewing changes exceeding 500 lines, THEN the Code Review System SHALL offer to review in batches by file
3. WHEN creating annotations for large files, THEN the Code Review System SHALL apply decorations incrementally to avoid blocking the UI
4. WHEN multiple files have changes, THEN the Code Review System SHALL process them concurrently
5. WHERE a diff-based review is in progress, the Code Review System SHALL allow cancellation and cleanup

### Requirement 12: Preset Auto-Selection

**User Story:** As a developer, I want the system to intelligently suggest the most appropriate preset based on my current context, so that I get optimal results without manual selection.

#### Acceptance Criteria

1. WHEN a user triggers review on uncommitted changes, THEN the Code Review System SHALL suggest the "Pre-Commit" preset by default
2. WHEN a user triggers review on a file with security-sensitive patterns, THEN the Code Review System SHALL suggest the "Security Audit" preset
3. WHEN a user triggers review on a file with performance-critical code, THEN the Code Review System SHALL suggest the "Performance" preset
4. WHEN a user triggers review during refactoring, THEN the Code Review System SHALL detect refactoring patterns and suggest the "Refactoring" preset
5. WHERE the system cannot determine an appropriate preset, the Code Review System SHALL default to "Quick Check"
