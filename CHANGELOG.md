# Change Log

All notable changes to the "Orbit" extension will be documented in this file.

## [2.0.0] - 2026-03-08

### Added
- **Structured Reasoning Engine**: Mandatory 5-section reasoning (What, Why, Improvements, Tradeoffs, Production) for all AI responses.
- **Enhanced Code Review**: Inline comments with attached reasoning and suggested fixes.
- **Diff Engine with Approval Flow**: Side-by-side diff previews with explicit Accept/Reject/Partial-Accept buttons.
- **Performance Analyzer**: Complexity analysis (Time/Space) and optimization suggestions for selected code.
- **Decision Journal**: SQLite-backed history tracking for all approved AI changes and reviews.
- **Enhanced Context Collector**: Intelligent context gathering with token prioritization and import-aware file collection.
- **New UI Components**: Decision History viewer, interactive Diff Approval panel, and styled Reasoning displays.

### Improved
- **Provider Layer**: Wrapped existing Ollama and Online providers with the transformation router.
- **Offline Reliability**: Enhanced formatting for local models to ensure consistent reasoning output.
- **Performance**: Optimized SQLite queries and minimized context gathering latency.

### Changed
- Migrated from generic AI assistant to a reasoning-first coding companion.

---

## [0.0.3] - 2026-01-14

### Added
-   Initial release of DevMind.
-   Chat interface with local LLM support (Ollama).
-   "Explain Selection" command.
-   Local semantic search (RAG) with `nomic-embed-text`.
-   "Edit Code" command using unified diffs.
-   Offline-first architecture.
