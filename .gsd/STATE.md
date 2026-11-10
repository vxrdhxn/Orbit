## Last Session Summary
Codebase mapping complete.
- 6 components identified
- 6 production dependencies analyzed
- 2 technical debt items found

## Technical debt (named 2026-11-10)

Source list: `.gsd/ARCHITECTURE.md` > Technical Debt.

1. **Git journal sync robustness** (`src/memory/GitJournalSyncService.ts`) - logged, not fixed.
   - `exportAndSync` runs `git fetch`, `commit`, `pull --rebase` and `push` on the user's working branch, so a sync while the tree is dirty or mid-rebase can interfere with their work.
   - Remote journal lines are parsed with `JSON.parse` with no per-line guard; one malformed line aborts the import (the error is swallowed by an empty `catch`).
   - `isSyncing` is an in-process flag only, so two VS Code windows can sync concurrently.
   - Merge conflicts on `.orbit/journal.jsonl` are not resolved; the sync aborts the rebase and warns the user.
2. **Dependency vulnerabilities** - logged, not fixed. `npm audit --omit=dev` reports 10 (7 high, 3 critical): `tar`, `@simple-git/argv-parser`, `protobufjs`, `sharp` (via `@xenova/transformers`) and a nested `nanoid` under `node-llama-cpp`.
   - `tar` is fixable with `npm audit fix`; the `sharp` fix is a breaking downgrade of `@xenova/transformers` (`--force`), so needs its own task and a re-run of the embedding tests.
## Offline native loader compatibility

**Objective:** Load the ESM-only `node-llama-cpp` package only from Orbit's worker.

**Changes:** Removed extension-host CommonJS loading; added a native, Webpack-preserved
worker import; configured the webpack TypeScript loader to retain `import()`.

**Verification:**
- Webpack compilation passed successfully.
- `dist/extension.js` contains no `require('node-llama-cpp')`.
- `dist/worker.js` contains the native dynamic import:
  `import(/* webpackIgnore: true */ 'node-llama-cpp')`.
- Existing offline model-file validation remains intact in `LocalClient`.
- Full Jest suite passed: 27 test suites and 126 tests.
- TypeScript test compilation passed.
- The cached VS Code E2E suite exited successfully; its existing IPC coverage uses a mock LLM, not native inference.

**Remaining:** Run a live offline generation smoke test on a host with an installed GGUF model
and the VS Code Electron ABI used by the production extension.
