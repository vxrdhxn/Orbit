# Roadmap

## Phase 1 — Offline Native Loader Compatibility

### Task 1: Isolate node-llama-cpp from the extension host
- Ensure `node-llama-cpp` is not loaded through CommonJS in the extension host.
- Keep native loading inside the worker.
- Preserve the existing offline model-file validation.
- Ensure Webpack does not rewrite the worker's native dynamic import.

### Task 2: Verify bundle compatibility
- Compile the extension and worker bundles.
- Confirm the extension bundle contains no CommonJS `require('node-llama-cpp')`.
- Confirm the worker contains the preserved native dynamic import.
- Run TypeScript compilation and existing tests.

### Task 3: Live offline smoke test
- Run Orbit with a valid GGUF model.
- Verify the offline provider can load the model.
- Verify a real generation request completes.
- Verify compatibility with the VS Code Electron ABI.

## Verification

The phase is complete when all SPEC acceptance criteria are satisfied and the live offline smoke test passes.
