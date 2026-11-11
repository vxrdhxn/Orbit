# Change Log

All notable changes to the "Orbit" extension will be documented in this file.

## [2.1.0] - 2026-11-11

### Added
- **Agent-style chat**: Replies stream live. Tool calls appear as expandable steps with a running, done or failed state, with an animated working indicator and elapsed time. `Esc` stops a reply. A welcome screen with suggestions, and the panel now follows the VS Code theme.
- **Inline change review**: Edits are shown inside the real file, with removed lines in red and added lines in green, and Accept / Reject buttons above each change. `Ctrl + Enter` accepts all and `Ctrl + Backspace` rejects all. This replaces the side-by-side diff and the notification prompt.
- **Attachments that work everywhere**: Attach recent, workspace or any on-disk files (no open folder needed), shown as chips. Images are sent to cloud and local-server models.
- `orbit.review.enabledCategories` setting for Orbit Pilot.

### Changed
- **Decision Journal storage** uses VS Code's built-in `node:sqlite` instead of the native `better-sqlite3` module. Requires VS Code 1.101 or newer.
- **Semantic search** uses `@huggingface/transformers` (the maintained successor of `@xenova/transformers`) with the same embedding model, so existing indexes stay valid.
- **Git team sync** keeps the journal on a dedicated `orbit-journal` branch built with git plumbing. It no longer commits, rebases or pushes on your working branch. Records merge as a union by id, a rejected push is retried after merging, malformed lines are skipped, and a lock prevents concurrent syncs from two windows.
- "Add" requests never delete existing code. The model only writes the new code, which Orbit appends unless you say where it goes.
- `orbit.reasoning.maxRetries`, `orbit.reasoning.fallbackToRaw`, `orbit.context.maxTokens`, `orbit.context.includeDecisions`, `orbit.decisionJournal.enabled` and `orbit.decisionJournal.maxHistoryItems` now take effect. They were declared before but ignored.
- The `@/` import alias in context collection resolves to `src/` first.

### Fixed
- Offline chat reloaded the model for every message and every agent step. The model now loads once, chat preempts background completions and reviews, and replies are length-capped.
- The Decision Journal silently did nothing inside VS Code because `better-sqlite3` was built for a different Node ABI.
- Orbit Pilot could never report a finding: it passed an empty category list, which filtered out everything. An empty list now means every category.
- An edit that changed nothing was reported as "Done". It is now retried once and otherwise reported honestly.
- Placeholder notes like `[edited file]` in the chat history were copied by small models instead of real tool calls.
- Registering the inline review commands twice threw "command already exists".

### Removed
- The unused `orbit.performance.showUncertainty` setting.
- An old, unbuilt copy of the chat UI under `src/ui` and its React and Vite dependencies.

### Security
- Production dependencies have no known vulnerabilities (`npm audit --omit=dev`). This fixes `tar`, `@simple-git/argv-parser`, `nanoid`, `protobufjs` and `sharp`.

## [2.0.1] - 2026-11-10

### Added
- **Hybrid providers**: Free cloud pool (Pollinations), Groq, OpenRouter, local OpenAI-compatible servers, and a custom API endpoint, with fallback provider pooling and rate-limit queueing. Ollama support was replaced by a built-in offline runtime.
- **Offline model bootstrap**: The default GGUF model downloads on the first message in `offline` mode, and runs through `node-llama-cpp` inside a worker thread.
- **On-demand runtime install**: `node-llama-cpp` and `@xenova/transformers` (now `@huggingface/transformers`) are no longer bundled in the extension. Orbit asks once, then installs them with `npm` into `~/.orbit/runtime`. This keeps the package small (about 4 MB) and works on every platform. Requires Node.js.
- **Structured router generation**: Structured, validated reasoning responses with retries (`orbit.reasoning.maxRetries`, `orbit.reasoning.fallbackToRaw`) and tolerant response parsing.
- **Safe inline apply**: Proposed edits open as a diff and are written only after approval; review suggested fixes can be applied safely.
- **GitHub PR comment integration**: Post review findings to the active pull request through the GitHub CLI (`orbit.prIntegration.enabled`).
- **Team sync**: Decision journal sync via JSONL, with a `file` or `git` method (`orbit.sync.method`).
- **Custom review presets** with persistent storage (`orbit.customReviewPresets`), real unified diff generation, and AI-derived confidence scoring for corrections.
- **Orbit output channel**: Diagnostic messages now go to an "Orbit" output channel instead of the console.
- Opt-in real-inference test (`ORBIT_TEST_MODEL`), and tests for the apply-tool prompt requirement.

### Changed
- The agent must use the `apply` tool for file modifications and may not claim a file changed unless `apply` ran.
- Extracted `ServiceLocator` and `CommandRegistrar` from `extension.ts`.
- Cleaner chat UI: tool calls, observations, agent loop steps and `<think>` tags are hidden, and long tool output is truncated.
- Lower `max_tokens` and optimized token usage to avoid Groq rate-limit errors.
- The default `orbit.onlineApiEndpoint` is now `https://api.openai.com/v1` (it was a placeholder domain).
- Separated Jest unit tests from VS Code E2E tests. The README config table, prerequisites and shortcuts were brought in line with `package.json`.

### Fixed
- Chat responses are finalized after the agent loop, and chat cancellation and response validation are hardened.
- SSE stream errors are surfaced instead of swallowed, which caused blank responses.
- Review findings, the review summary CodeLens and the approval journal now use the correct workspace project, and partial diffs are validated before applying.
- Missing Orbit commands are declared in `package.json`, and lint warnings were cleaned up.
- `node-llama-cpp` (ESM-only) is loaded only from the worker, not the extension host bundle.

### Security
- Agent tools (`ls`, `read`, `apply`) are restricted to the workspace, including symlink resolution.
- Inline apply paths are validated against the workspace.
- Terminal commands require confirmation, run only inside the workspace, and have a timeout and output cap.
- Tool arguments are validated before use.
- Model content is escaped before it is rendered in the webview and reasoning panels.
- Removed leftover debug output files from the repository and stopped tracking editor and agent tool folders.

---

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
