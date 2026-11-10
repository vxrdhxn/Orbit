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

- **`offline`:** [Node.js](https://nodejs.org) (for `npm`). On first use Orbit asks, then installs `node-llama-cpp` into `~/.orbit/runtime` (several hundred MB) and downloads the default `Qwen2.5-Coder-7B` model to `~/.orbit/models` (several GB).
- **Local semantic search:** the first index also asks to install `@xenova/transformers` (about 100 MB) into `~/.orbit/runtime`.
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

Shortcuts apply when the editor has focus (`Cmd` replaces `Ctrl` on macOS).

## 🧭 Commands

Open the Command Palette (`Ctrl + Shift + P`) and type `Orbit`:

| Command | ID |
| :--- | :--- |
| Orbit: Open Chat | `orbit.chat` |
| Orbit: Explain Selection | `orbit.explain` |
| Orbit: Search Codebase | `orbit.search` |
| Orbit: Index Workspace for Semantic Search | `orbit.indexWorkspace` |
| Orbit: Update Semantic Index for Current File | `orbit.indexCurrentFile` |
| Orbit: Review Code | `orbit.review` |
| Orbit: Edit Code | `orbit.edit` |
| Orbit: Health Check | `orbit.health` |
| Orbit: Analyze Algorithmic Performance | `orbit.analyzePerformance` |
| Orbit: Toggle Pilot Mode | `orbit.pilot.toggle` |
| Orbit: Undo Last Pilot Fix | `orbit.pilot.undo` |
| Orbit: Export Journal to Workspace | `orbit.sync.export` |
| Orbit: Import Journal from Workspace | `orbit.sync.import` |
| Orbit: View Decision History | `orbit.viewDecisionHistory` |
| Orbit: Toggle Online/Offline Mode | `orbit.toggleMode` |
| Orbit: Show Findings | `orbit.showFindings` |
| Orbit: View AI Reasoning | `orbit.viewReasoning` |

## 🔒 Security

Orbit lets an AI model act on your workspace, so file and command access is restricted:

- **Workspace-restricted tools.** The agent's `ls`, `read` and `apply` tools resolve every path against the open workspace folder. Paths that escape it (`..`, absolute paths elsewhere, or symlinks that resolve outside) are rejected with `Access denied`.
- **Inline apply validation.** Proposed edits are checked against the workspace before anything happens, open as a diff, and are written only after you click **Accept**. Rejecting leaves the real file untouched.
- **Terminal command hardening.** Commands never run silently: each one shows a modal prompt with the command and working directory and runs only on **Run**. The working directory must be inside the workspace, empty commands are refused, and captured runs have a 30-second timeout and a 1 MB output cap.
- **Tool argument validation.** Malformed tool arguments (null, arrays, empty paths, non-string commands or queries, empty `apply` code) are rejected before reaching a tool.
- **Escaped webview output.** Structured AI responses are HTML-escaped before being rendered in the chat.
- **PR comments.** Posting a review to a pull request goes through the GitHub CLI (`gh pr comment`, using your existing `gh` login) with arguments passed directly, not through a shell. It is controlled by `orbit.prIntegration.enabled`.
- **Prompt size cap.** Prompts over 200,000 characters are truncated before they are sent to a model.

In `cloud`, `custom`, `groq` and `openrouter` modes your prompts and code context are sent to the chosen provider. Use `offline` or `local-server` mode to keep everything on your machine.

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
