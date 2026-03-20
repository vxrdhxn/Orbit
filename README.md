# Orbit 🪐

**Always watching your code.**

Orbit is a powerful, offline-capable AI coding assistant for VS Code. It leverages local LLMs (via Ollama) to provide intelligent code explanations, semantic search, AI-driven code reviews, and interactive chat, keeping your data private and secure.

## 🚀 Features

### 🤖 AI Chat & Context
Interact with your codebase using a chat interface. Ask questions, request code snippets, or discuss architectural decisions without leaving your editor.
- **Context-Aware:** Orbit deeply understands your active file and dynamically resolves complex dependency graphs.
- **Image Support:** Paste images directly into the chat for multimodal context.

### 📝 AI Code Review
Get instant feedback on your code or Git changes.
- **Review Code:** Analyze the current file for bugs, improved practices, and readability.
- **Review Git Changes:** Automatically review uncommitted changes in your git repository.

### ✈️ Orbit Pilot (Agentic Capabilities)
Transform Orbit into a proactive agent watching over your work.
- **Background Analysis:** Orbit silently analyzes your active files and reports hidden issues directly to the VS Code Problems tab.
- **Auto-Fix Engine:** Automatically repair low-risk issues as you type.
- **Instant Undo:** Mistakes happen. Every auto-fix can be undone with a single command.

### 🧠 Decision Journal & Team Sync
Orbit remembers why code was changed.
- **Memory:** All AI-driven edits and auto-fixes are securely logged into a local SQLite database (`.orbit/decisions.db`).
- **Workspace Sync:** Enable `orbit.sync.enableWorkspaceSync` to export your journal to `.orbit/journal.json`. Commit this file to Git so your entire team shares the same AI context!

### ⚙️ Enhanced Controls
- **Diff Approval View:** Review and approve code diffs interactively before applying them.
- **Performance Analytics:** Analyze your algorithms for Big-O notation and detailed efficiency bottlenecks.

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
