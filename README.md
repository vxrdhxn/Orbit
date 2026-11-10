# Orbit 🪐

**Always watching your code.**

Orbit is a powerful VS Code extension that provides agentic AI chat features offline, online, and via custom API keys. Whether you are using built-in local models for absolute privacy, or leveraging cloud APIs for maximum speed, Orbit delivers intelligent code explanations, semantic search, AI-driven code reviews, and interactive chat.

## 🚀 Features

### 🤖 AI Chat & Smart Apply
Interact with your codebase using a chat interface. Ask questions, request code snippets, or discuss architectural decisions.
- **Inline Code Apply:** Review AI-suggested changes in a side-by-side diff view and apply them with one click.
- **Auto-Apply Detection:** Orbit automatically detects when the AI suggests a fix for your active file and offers to open the diff.
- **Context-Aware:** Orbit understands your active file and deep dependencies.
- **Semantic Search:** Search your entire workspace with semantic understanding.
- **Image Support:** Paste images directly into the chat for multimodal context.

### 🐚 Terminal Integration
- **Run Commands:** AI-suggested bash/shell commands get a "Run ▶" button. Orbit executes them with your confirmation and captures the output.

### 📝 AI Code Review
Get instant feedback on your code or Git changes.
- **Review Code:** Analyze the current file for bugs, improved practices, and readability.
- **Review Git Changes:** Automatically review uncommitted changes in your git repository.
- **PR Integration:** Connect AI review directly to Git branches and Pull Requests.

### ✈️ Orbit Pilot (Agentic Capabilities)
- **Background Analysis:** Orbit silently analyzes your active files and reports issues to the VS Code Problems tab.
- **Auto-Fix Engine:** Automatically repair low-risk issues as you type.

### 🧠 Decision Journal
- **Memory:** All AI-driven edits and auto-fixes are logged into a local SQLite database.
- **Team Sync:** Export your journal to `.orbit/journal.json` to share AI context with your team via Git.

## 📋 Prerequisites

Orbit works out of the box in the default `cloud` mode. Other modes need:

- **`offline`:** no extra install. Orbit runs a GGUF model locally with `node-llama-cpp`. The default `Qwen2.5-Coder-7B` is downloaded to `~/.orbit/models` on first use (several GB).
- **`local-server`:** a running OpenAI-compatible server such as LM Studio (see `orbit.localServerEndpoint`).
- **`custom`, `groq`, `openrouter`:** an API key for the provider.

## ⚙️ Configuration

| Setting | Default | Description |
| :--- | :--- | :--- |
| `orbit.mode` | `cloud` | Operation mode (`cloud`, `custom`, `offline`, `local-server`, `groq`, `openrouter`). |
| `orbit.offlineModel` | `Qwen2.5-Coder-7B` | Offline model to use in `offline` mode. |
| `orbit.onlineApiEndpoint` | `https://api.openai.com/v1` | OpenAI-compatible endpoint for `custom` mode. |
| `orbit.onlineApiKey` | | API Key for `custom` mode. |
| `orbit.groqApiKey` | | API Key for Groq. |
| `orbit.openRouterApiKey` | | API Key for OpenRouter. |
| `orbit.onlineModel` | `llama-3.3-70b-specdec` | Model ID for `custom` mode. |
| `orbit.localServerEndpoint` | `http://localhost:1234/v1` | Endpoint for local inference server. |
| `orbit.localServerModel` | `local-model` | Model ID for local inference server. |
| `orbit.reasoning.maxRetries` | `3` | Max retries for structured reasoning generation. |
| `orbit.reasoning.fallbackToRaw` | `true` | Fall back to raw output if structured generation fails after max retries. |
| `orbit.context.maxTokens` | `4000` | Max tokens for AI context. |
| `orbit.context.includeDecisions`| `true` | Include past decisions in the AI context. |
| `orbit.decisionJournal.enabled` | `true` | Enable the Decision Journal. |
| `orbit.decisionJournal.maxHistoryItems` | `50` | Max historical decisions shown in the history view. |
| `orbit.performance.showUncertainty` | `true` | Show uncertainty levels in performance analysis results. |
| `orbit.pilot.enabled` | `true` | Enable Orbit Pilot for proactive background analysis. |
| `orbit.pilot.autoFixLevel` | `none` | Level of findings Pilot fixes automatically (`none`, `suggestion`, `info`). |
| `orbit.sync.enableWorkspaceSync`| `false` | Enable automatic syncing of the journal. |
| `orbit.sync.method` | `file` | Team sync method: `file` saves to the workspace, `git` commits and syncs with the remote. |
| `orbit.embedding.model` | `Xenova/all-MiniLM-L6-v2` | Model ID for offline semantic embeddings. |
| `orbit.prIntegration.enabled` | `true` | Enable PR Integration. |
| `orbit.customReviewPresets` | `[]` | Custom review presets. |

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

### Testing

- Unit tests: `npm test`
- Real offline inference (opt-in): the test in `test/unit/providers/LocalClient.inference.test.ts` loads a real GGUF model through `LocalClient` and generates once. It is skipped unless `ORBIT_TEST_MODEL` points to a GGUF file, and it needs the built worker, so run `npm run compile` first.

```powershell
npm run compile
$env:ORBIT_TEST_MODEL = "$HOME\.orbit\models\Qwen2.5-Coder-7B.gguf"
npx jest test/unit/providers
```

## 📄 License

[MIT](LICENSE)
