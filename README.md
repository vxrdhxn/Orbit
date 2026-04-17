# Orbit 🪐

**Always watching your code.**

Orbit is a powerful, offline-capable AI coding assistant for VS Code. It leverages local LLMs (via Ollama) to provide intelligent code explanations, semantic search, AI-driven code reviews, and interactive chat, keeping your data private and secure.

## 🚀 Features

### 🤖 AI Chat & Smart Apply
Interact with your codebase using a chat interface. Ask questions, request code snippets, or discuss architectural decisions.
- **Inline Code Apply:** Review AI-suggested changes in a side-by-side diff view and apply them with one click.
- **Auto-Apply Detection:** Orbit automatically detects when the AI suggests a fix for your active file and offers to open the diff.
- **Context-Aware:** Orbit understands your active file and deep dependencies.
- **Image Support:** Paste images directly into the chat for multimodal context.

### 🐚 Terminal Integration
- **Run Commands:** AI-suggested bash/shell commands get a "Run ▶" button. Orbit executes them with your confirmation and captures the output.

### 📝 AI Code Review
Get instant feedback on your code or Git changes.
- **Review Code:** Analyze the current file for bugs, improved practices, and readability.
- **Review Git Changes:** Automatically review uncommitted changes in your git repository.

### ✈️ Orbit Pilot (Agentic Capabilities)
- **Background Analysis:** Orbit silently analyzes your active files and reports issues to the VS Code Problems tab.
- **Auto-Fix Engine:** Automatically repair low-risk issues as you type.

### 🧠 Decision Journal
- **Memory:** All AI-driven edits and auto-fixes are logged into a local SQLite database.
- **Team Sync:** Export your journal to `.orbit/journal.json` to share AI context with your team via Git.

## 📋 Prerequisites

Orbit relies on **Ollama** to run LLMs locally.

1.  **Install Ollama:** [Download here](https://ollama.com/)
2.  **Pull Recommended Models:**
    ```bash
    ollama pull qwen2.5-coder:7b
    ollama pull nomic-embed-text
    ```

## ⚙️ Configuration

| Setting | Default | Description |
| :--- | :--- | :--- |
| `orbit.ollamaEndpoint` | `http://localhost:11434` | URL of your running Ollama server. |
| `orbit.ollamaModel` | `qwen2.5-coder:7b` | Main LLM used for chat and code generation. |
| `orbit.preferOnline` | `true` | Prefer online provider if configured. |
| `orbit.context.maxTokens` | `4000` | Max tokens for AI context. |

## ⌨️ Keyboard Shortcuts

| Shortcut | Command |
| :--- | :--- |
| `Ctrl + L` | **Focus Orbit Chat** (Open/Focus sidebar) |
| `Ctrl + Shift + L` | **Explain Selection** (Send code to chat) |
| `Ctrl + Alt + P` | **Analyze Performance** |
| `Ctrl + Alt + H` | **View Decision History** |

## 💻 Development

1.  Clone the repository.
2.  Install dependencies: `npm install`
3.  Build UI: `npm run build:ui`
4.  Compile Extension: `npm run compile`
5.  Run: Press `F5` to open the Extension Development Host.

## 📄 License

[MIT](LICENSE)
