# Orbit 🪐

**Always watching your code.**

Orbit is a powerful, offline-capable AI coding assistant for VS Code. It leverages local LLMs (via Ollama) to provide intelligent code explanations, semantic search, AI-driven code reviews, and interactive chat, keeping your data private and secure.

## 🚀 Features

### 🤖 AI Chat
Interact with your codebase using a chat interface. Ask questions, request code snippets, or discuss architectural decisions without leaving your editor.
- **Context-Aware:** Orbit understands your active file and project structure.
- **Image Support:** Paste images directly into the chat for multimodal context.

### 🔍 Semantic Search
Go beyond simple text matching. Orbit indexes your codebase to allow for semantic queries, helping you find relevant code based on *meaning* rather than just keywords.
- **Customizable Indexing:** Configure which files to include/exclude.
- **Powered by Embeddings:** Uses local embedding models (default: `nomic-embed-text`) for accurate retrieval.

### 📝 AI Code Review
Get instant feedback on your code or Git changes.
- **Review Code:** Analyze the current file for bugs, improved practices, and readability.
- **Review Git Changes:** Automatically review uncommitted changes in your git repository.
- **Inline Annotations:** View AI feedback directly in your editor with inline decorations and CodeLens actions.
- **Review Presets:** Choose from different review personas and strictness levels.

### 🛠️ Smart Commands
- **Explain Selection:** Highlight code and ask Orbit to explain it in plain English.
- **Edit Code (Diff):** Describe a change, and let Orbit generate a diff for you to apply.
- **MCP Servers:** Support for Model Context Protocol to extend capabilities.

## 📋 Prerequisites

Orbit relies on **Ollama** to run LLMs locally. You must have Ollama installed and the required models pulled before using the extension.

1.  **Install Ollama:** [Download here](https://ollama.com/)
2.  **Pull Recommended Models:**
    ```bash
    ollama pull qwen2.5-coder:7b
    ollama pull nomic-embed-text
    ```
    *Note: You can configure Orbit to use other models in the settings.*

## ⚙️ Configuration

You can customize Orbit via VS Code Settings (`Ctrl+,` -> search for "Orbit").

| Setting | Default | Description |
| :--- | :--- | :--- |
| `offlineDevAssistant.ollamaBaseUrl` | `http://127.0.0.1:11434` | URL of your running Ollama server. |
| `offlineDevAssistant.model` | `qwen2.5-coder:7b` | Main LLM used for chat and code generation. |
| `offlineDevAssistant.embeddingModel` | `nomic-embed-text` | Model used for generating embeddings. |
| `offlineDevAssistant.temperature` | `0.2` | Creativity level (lower is more deterministic). |
| `offlineDevAssistant.indexIncludeGlobs` | `**/*.{ts,tsx...}` | Glob patterns for files to index. |
| `offlineDevAssistant.indexExcludeGlobs` | `**/node_modules/**...` | Glob patterns to exclude from indexing. |

## ⌨️ Commands

Access these commands from the Command Palette (`Ctrl+Shift+P`):

-   `Orbit: Open Chat`: Open the sidebar chat.
-   `Orbit: Explain Selection`: Explain the highlighted code.
-   `Orbit: Review Code`: Perform an AI review of the current file.
-   `Orbit: Review Git Changes`: Review pending git changes.
-   `Orbit: Search Codebase`: Perform a semantic search.
-   `Orbit: Edit Code (Diff)`: Apply AI-suggested edits.
-   `Orbit: Health Check`: Verify connection to Ollama.

## 💻 Development

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Compile the extension:
    ```bash
    npm run compile
    ```
4.  Run in Debug mode:
    Press `F5` to open a new VS Code window with the extension loaded.

## 📄 License

[MIT](LICENSE)
