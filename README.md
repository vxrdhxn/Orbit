# DevMind

**DevMind** is a local, offline-first AI assistant for VS Code, powered by [Ollama](https://ollama.com/). It brings the power of large language models directly into your editor without sending your code to the cloud.

![Icon](resources/icon.svg)

## Features

- **Chat Interface**: Chat with your local LLM directly from the sidebar.
- **Explain Code**: Select code and ask DevMind to explain it in detail.
- **Semantic Search (RAG)**: Search your codebase using natural language queries. DevMind indexes your code locally for context-aware answers.
- **Edit Code**: Request code changes and see them applied as a unified diff.
- **Privacy Focused**: All processing happens locally on your machine.

## Requirements

1.  **Ollama**: You must have [Ollama](https://ollama.com/) installed and running.
2.  **Models**: Pull the necessary models. We recommend:
    -   **Chat/Code**: `qwen2.5-coder:7b` (or `codellama`, `mistral`, etc.)
    -   **Embeddings**: `nomic-embed-text`

    ```bash
    ollama pull qwen2.5-coder:7b
    ollama pull nomic-embed-text
    ```

## Extension Settings

This extension contributes the following settings:

*   `offlineDevAssistant.ollamaBaseUrl`: URL of your local Ollama server (default: `http://127.0.0.1:11434`).
*   `offlineDevAssistant.model`: The model to use for chat and code generation (default: `qwen2.5-coder:7b`).
*   `offlineDevAssistant.embeddingModel`: The model to use for generating embeddings (default: `nomic-embed-text`).
*   `offlineDevAssistant.temperature`: Controls randomness in output (default: `0.2`).
*   `offlineDevAssistant.indexIncludeGlobs`: Glob patterns for files to include in the index.
*   `offlineDevAssistant.indexExcludeGlobs`: Glob patterns for files to exclude from the index.

## Usage

1.  **Start Ollama**: Ensure `ollama serve` is running.
2.  **Open DevMind**: Click the robot icon in the Activity Bar.
3.  **Chat**: Type your question in the input box.
4.  **Commands**:
    -   `AI Assistant: Explain Selection (Local)`: Explains the selected code.
    -   `AI Assistant: Search Code (Local)`: Search your codebase.
    -   `AI Assistant: Edit Code (Unified Diff, Local)`: Apply changes to the current file.

## Known Issues

-   Initial indexing may take some time for large workspaces.
-   Requires a machine capable of running the selected LLMs reasonably fast.

## Release Notes

### 0.0.3
-   Initial release with Chat, Explain, Search, and Edit capabilities.
