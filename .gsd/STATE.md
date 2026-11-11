## Last Session Summary (2026-11-11)

**Objective:** Finish every open item from the project audit and get Orbit release-ready as 2.1.0.

**Changes:**
- Decision Journal storage moved from the native `better-sqlite3` module (built for system Node ABI 137, failed to load in VS Code's ABI 148, so the journal silently did nothing) to the built-in `node:sqlite`. Minimum VS Code is now 1.101.
- `@xenova/transformers` replaced by `@huggingface/transformers` 4.3.2 with the same embedding model; `npm audit --omit=dev` reports 0 vulnerabilities (was 10: 3 critical, 7 high).
- Git journal sync rewritten: dedicated `orbit-journal` branch built with git plumbing (never touches the user's branch, index or working tree), union merge by id, push-race retry, per-line JSON parsing, cross-window lock file.
- Six declared-but-ignored settings wired up, `orbit.performance.showUncertainty` removed, `orbit.review.enabledCategories` declared. Fixed Orbit Pilot filtering out every finding (empty category list).
- Removed the unbuilt legacy UI in `src/ui` (App.tsx, index.tsx, index.html, styles) and the root `vite.config.ts`, plus root `react`, `react-dom`, `vite`, `@vitejs/plugin-react`.
- `@/` alias in `ImportGraphBuilder` resolves to `src/` first.
- Earlier in the session: streaming agent chat UI, inline change review, attachments, add-only edit guard, model load-once and chat priority.

**Verification:** see the 2.1.0 entry in `CHANGELOG.md`; Jest, webview Vitest, VS Code E2E (including a real `node:sqlite` round trip inside VS Code), lint and both builds pass; a real embedding run with `@huggingface/transformers` returned 384-dim vectors.

**Offline smoke test (Roadmap Task 3):** done. The user ran offline chat with `Qwen2.5-Coder-1.5B` in the Extension Development Host (Electron ABI) and completed real generations and file edits.

**Risks / next:**
- Publishing 2.1.0 to the Marketplace needs the publisher token and a final check of the packaged `.vsix` in a clean VS Code profile.
- Users on VS Code older than 1.101 can no longer install this version (needed for `node:sqlite`).

## Technical debt

None open. Both items named on 2026-11-10 (git journal sync robustness, dependency vulnerabilities) were fixed on 2026-11-11.
