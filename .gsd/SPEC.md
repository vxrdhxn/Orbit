# Offline native loader compatibility

Status: FINALIZED

## Requirement

Orbit's offline provider must load the ESM-only `node-llama-cpp` package inside
its worker without loading that package in the VS Code extension host.

## Acceptance criteria

- The extension bundle contains no CommonJS `require('node-llama-cpp')` call.
- The worker uses a native dynamic import that Webpack does not rewrite.
- Offline connection checks retain the existing model-file validation.
- The extension and worker bundles compile successfully.

## Non-goals

- Downloading a model or executing a live inference test.
- Changing the mock-based ChatProvider IPC E2E suite.
