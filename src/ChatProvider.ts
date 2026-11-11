import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ILLMClient } from './providers/ILLMClient';

import { performSearch } from './searchCommand';

import { FileReferenceParser } from './fileReference/fileReferenceParser';
import { FileContentReader } from './fileReference/fileContentReader';
import { FileReferenceManager } from './fileReference/fileReferenceManager';
import { ToolManager } from './tools/ToolManager';
import { InlineApplyService } from './services/InlineApplyService';
import { TerminalService } from './services/TerminalService';
import { parseCodeBlocks, languageMatchesFile, isTerminalLanguage } from './utils/codeBlockParser';
import { LLMRouter } from './reasoning/LLMRouter';
import { StructuredResponse } from './reasoning/types';
import { log } from './logger';
import { resolveWorkspacePath } from './utils/workspacePath';
import { classifyEditIntent, preserveExistingCode, countLineChanges } from './utils/editIntent';

const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_CHARS = 1500;
// How long a successful connection check is trusted before checking again.
const CONNECTION_CACHE_MS = 5 * 60 * 1000;
// How often streamed tokens are pushed to the webview.
const STREAM_FLUSH_MS = 50;
// Size limit for each file attached to a message.
const MAX_ATTACHMENT_CHARS = 12000;

/**
 * Shortens tool traffic in an old reply so history stays small: file contents written
 * by apply and raw tool output are replaced by a one-line note.
 */
export function summarizeForHistory(text: string): string {
    return text
        .replace(/<tool_call name="apply"[^>]*path="([^"]+)"[^>]*>[\s\S]*?(<\/tool_call>|$)/g, '[edited $1]')
        .replace(/<tool_call name="([^"]+)"[^>]*>([\s\S]*?)(<\/tool_call>|$)/g, (_m, name, body) => `[used ${name} ${String(body).trim().slice(0, 120)}]`)
        .replace(/<observation[^>]*>[\s\S]*?(<\/observation>|$)/g, '')
        .replace(/<think>[\s\S]*?(<\/think>|$)/g, '')
        .trim();
}

/** Removes a leading/trailing markdown code fence the model may wrap file content in. */
function stripCodeFence(text: string): string {
    return text
        .replace(/^\s*```[^\n]*\n/, '')
        .replace(/\n?```\s*$/, '\n')
        .replace(/^\n/, '');
}

/** True when the text before a tool call is basically the user's own request repeated. */
export function echoesRequest(text: string, userMsg: string): boolean {
    const simplify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const a = simplify(text);
    const b = simplify(userMsg);
    if (!a || !b) {
        return false;
    }
    return a === b || (a.includes(b) && b.length / a.length > 0.7) || (b.includes(a) && a.length / b.length > 0.7);
}

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  /** Absolute paths of files the user attached to this message. */
  attachments?: string[];
  timestamp: number;
  structuredReasoning?: StructuredResponse;
}

export interface ChatSession {
  id: string;
  title: string;
  lastModified: number;
  messages: ChatMessage[];
}

export class ChatProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'orbit.chatView';
  private _abortController: AbortController | null = null;
  private _currentImage: string | null = null;
  private _webviewView: vscode.WebviewView | undefined;

  private _currentSession: ChatSession;
  private _fileParser: FileReferenceParser;
  private _fileReader: FileContentReader;
  private _fileManager: FileReferenceManager;
  private _inlineApply: InlineApplyService;
  private _terminalService: TerminalService;

  private _toolManager: ToolManager;
  private _maxIterations = 8;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _llmClient: ILLMClient,
    private readonly _llmRouter?: LLMRouter
  ) {

    this._currentSession = this._createNewSession();
    this._fileParser = new FileReferenceParser();
    this._fileReader = new FileContentReader();
    this._fileManager = new FileReferenceManager(_context);
    this._inlineApply = new InlineApplyService();
    // Inline Accept / Reject buttons and highlights in the editor.
    this._inlineApply.register(_context);
    this._terminalService = new TerminalService();
    this._toolManager = new ToolManager(this._terminalService, this._inlineApply);
  }

  private _createNewSession(): ChatSession {
    return {
      id: Date.now().toString(),
      title: 'New Chat',
      lastModified: Date.now(),
      messages: []
    };
  }

  private async _saveHistory() {
    const history = this._context.globalState.get<ChatSession[]>('chatHistory', []);
    const index = history.findIndex(s => s.id === this._currentSession.id);

    if (this._currentSession.messages.length > 0) {
      if (this._currentSession.title === 'New Chat' && this._currentSession.messages.length > 0) {
        const firstMsg = this._currentSession.messages[0].content;
        this._currentSession.title = firstMsg.slice(0, 30) + (firstMsg.length > 30 ? '...' : '');
      }

      this._currentSession.lastModified = Date.now();

      if (index !== -1) {
        history[index] = this._currentSession;
      } else {
        history.unshift(this._currentSession);
      }
      await this._context.globalState.update('chatHistory', history);
    }
  }

  private _getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.png': return 'image/png';
      case '.jpg':
      case '.jpeg': return 'image/jpeg';
      case '.gif': return 'image/gif';
      case '.webp': return 'image/webp';
      default: return 'application/octet-stream';
    }
  }

  public async handleExternalInstruction(instruction: string) {
    if (!this._webviewView) {
      await vscode.commands.executeCommand('orbit.chatView.focus');
    }

    if (!this._webviewView) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (this._webviewView) {
      this._webviewView.webview.postMessage({ type: 'loadChat', value: this._currentSession.messages });
      this._webviewView.webview.postMessage({ type: 'status', value: '' });
      await this._processMessage(instruction, this._webviewView.webview, true);
    }
  }

  /** Skips the per-message connection check for a while after one succeeds. */
  private _lastConnectionOkAt = 0;

  private async _checkConnectionCached(): Promise<{ ok: boolean; message: string; canBootstrap?: boolean }> {
    if (Date.now() - this._lastConnectionOkAt < CONNECTION_CACHE_MS) {
      return { ok: true, message: 'Connected' };
    }
    const status = await this._llmClient.checkConnection();
    if (status.ok) {
      this._lastConnectionOkAt = Date.now();
    }
    return status;
  }

  private async _processMessage(userMsg: string, webview: vscode.Webview, appendToUI: boolean = false, attachments: string[] = []) {
      log(`Processing message (Agentic Loop): ${userMsg}`);

      if (appendToUI) {
          webview.postMessage({type: 'addMessage', role: 'user', content: userMsg});
      }

      // Add to current session
      this._currentSession.messages.push({role: 'user', content: userMsg, timestamp: Date.now(), ...(attachments.length ? { attachments } : {})});

      // Show an empty assistant turn right away so the user sees the agent working.
      webview.postMessage({type: 'agentStart'});
      webview.postMessage({type: 'status', value: 'Thinking...'});

      const status = await this._checkConnectionCached();
      webview.postMessage({type: 'updateConnectionState', value: status});

      if (!status.ok && !status.canBootstrap) {
          console.warn('Connection failed:', status.message);
          const errorMessage = `⚠️ **Connection Error**: ${status.message}`;
          webview.postMessage({type: 'agentSet', value: errorMessage});
          webview.postMessage({type: 'agentEnd'});

          // Save to session history so it doesn't disappear on refresh
          this._currentSession.messages.push({role: 'ai', content: errorMessage, timestamp: Date.now()});
          this._saveHistory();
          webview.postMessage({type: 'status', value: ''});
          return;
      }

      if (this._abortController) {
          this._abortController.abort();
      }
      this._abortController = new AbortController();
      // Keep our own reference: this._abortController is replaced by the next message.
      const signal = this._abortController.signal;
      let wasCancelled = false;
      let iteration = 0;
      let fullPrompt = await this._buildInitialPrompt(userMsg, attachments);
      const images = await this._getCurrentImagePayload();
      let imageNotice = '';
      if (images && (this._llmClient as any).supportsImages?.() === false) {
          fullPrompt = fullPrompt.replace('User Question:', 'Note: the user attached an image, but you cannot see images. Say so briefly if it matters.\n\nUser Question:');
          imageNotice = "> The offline model can't see images. Switch to a cloud model to ask about the picture.\n\n";
          webview.postMessage({type: 'agentDelta', value: imageNotice});
      }
      // Everything the user sees for this turn: text, tool calls and their results.
      let finalCombinedResponse = imageNotice;
      let shouldStop = false;
      let nudged = false;

      // Batches streamed tokens so the webview re-renders ~20 times a second, not per token.
      let pendingDelta = '';
      let flushTimer: NodeJS.Timeout | null = null;
      const flush = () => {
          if (flushTimer) {
              clearTimeout(flushTimer);
              flushTimer = null;
          }
          if (pendingDelta) {
              webview.postMessage({type: 'agentDelta', value: pendingDelta});
              pendingDelta = '';
          }
      };
      const streamToUI = (text: string) => {
          pendingDelta += text;
          if (!flushTimer) {
              flushTimer = setTimeout(flush, STREAM_FLUSH_MS);
          }
      };
      /** Replaces the whole visible turn, e.g. after a tool call is normalized. */
      const syncUI = () => {
          pendingDelta = '';
          flush();
          webview.postMessage({type: 'agentSet', value: finalCombinedResponse});
      };

      while (iteration < this._maxIterations) {
          if (signal.aborted) {
              wasCancelled = true;
              break;
          }
          iteration++;
          log(`Agent Loop Iteration ${iteration}`);
          webview.postMessage({type: 'status', value: iteration === 1 ? 'Thinking...' : 'Working...'});

          // Separate this step's text from the previous step's tool result.
          if (finalCombinedResponse && !finalCombinedResponse.endsWith('\n')) {
              finalCombinedResponse += '\n';
              streamToUI('\n');
          }

          try {
              let currentTurnResponse = '';
              const startTime = Date.now();
              let chunkCount = 0;
              let firstChunk = true;
              await this._llmClient.generateStream(
                  fullPrompt,
                  (chunk) => {
                      if (chunk === null || chunk === undefined) {
                          return;
                      }
                      if (firstChunk) {
                          firstChunk = false;
                          webview.postMessage({type: 'status', value: 'Responding...'});
                      }
                      currentTurnResponse += chunk;
                      chunkCount++;
                      streamToUI(chunk);
                  },
                  signal,
                  images
              );
              flush();

              const durationMs = Date.now() - startTime;
              const tps = (chunkCount / Math.max(durationMs / 1000, 0.001)).toFixed(1);
              webview.postMessage({type: 'telemetry', value: {durationMs, tps, iteration}});

              log(`Stream generation completed. Length: ${currentTurnResponse.length}, TPS: ${tps}`);

              // Check for tool calls
              // The closing tag is optional: small models often stop right after the file contents.
              const toolCallMatch = currentTurnResponse.match(/<tool_call name="([^"]+)"([^>]*)>([\s\S]*?)(?:<\/tool_call>|$)/);

              if (toolCallMatch) {
                  const toolName = toolCallMatch[1];
                  const pathAttribute = toolCallMatch[2].match(/path="([^"]+)"/)?.[1];
                  const toolBody = toolCallMatch[3];
                  let toolArgs = {};
                  let parseError = null;

                  if (toolName === 'apply' && pathAttribute) {
                      // Raw-code form: the body is the file content, no JSON escaping needed.
                      toolArgs = { path: pathAttribute, code: stripCodeFence(toolBody) };
                  } else {
                      try {
                          toolArgs = JSON.parse(toolBody.trim());
                      } catch (e: any) {
                          parseError = e.message;
                          log(`Failed to parse tool args: ${e.message}`);
                      }
                  }

                  // Keep only the text before the call plus one well-formed call. Anything the
                  // model wrote after it (e.g. an invented result) is dropped.
                  let textBefore = currentTurnResponse.slice(0, toolCallMatch.index);
                  // Small models often just echo the request; say what will happen instead.
                  if (toolName === 'apply' && pathAttribute && echoesRequest(textBefore, userMsg)) {
                      textBefore = classifyEditIntent(userMsg) === 'add'
                          ? `I'll add that to \`${pathAttribute}\`.\n`
                          : `I'll update \`${pathAttribute}\`.\n`;
                  }
                  const normalizedCall = `${textBefore}<tool_call name="${toolName}"${toolCallMatch[2]}>${toolBody}</tool_call>`;
                  finalCombinedResponse += normalizedCall;
                  syncUI();

                  webview.postMessage({
                      type: 'status',
                      value: toolName === 'apply' && !parseError
                          ? 'Waiting for you to accept or reject the change in the editor...'
                          : `Calling ${toolName}...`
                  });

                  let result: any;
                  let applyCheck: { code: string; original: string; restoredLines: number } | null = null;

                  if (parseError) {
                      result = {
                          output: `Failed to parse tool arguments as JSON: ${parseError}. Please ensure arguments are valid JSON. If you are writing code with the 'apply' tool, make sure to escape newlines properly, OR just output a standard markdown codeblock with the file path (e.g. \`\`\`typescript:path/to/file.ts) instead of using the apply tool.`,
                          isError: true
                      };

                      shouldStop = true;
                  } else {
                      if (toolName === 'apply') {
                          applyCheck = await this._checkApply(userMsg, toolArgs as any);
                          (toolArgs as any).code = applyCheck.code;
                      }
                      result = await this._toolManager.callTool(toolName, toolArgs);
                  }

                  const observation =
                      `\n<observation>\n${result.output}\n</observation>\n`;

                  let uiOutput = result.output;

                  if (uiOutput.length > 1500) {
                      uiOutput =
                          uiOutput.substring(0, 1500) +
                          '\n... [Output truncated for UI brevity]';
                  }

                  const resultStatus = result.isError ? 'error' : 'ok';
                  const uiObservation =
                      `\n<observation status="${resultStatus}">\n${uiOutput}\n</observation>\n`;

                  if (signal.aborted) {
                      wasCancelled = true;
                      break;
                  }

                  fullPrompt += normalizedCall + observation;
                  finalCombinedResponse += uiObservation;

                  // Once the user has accepted or rejected a file change, the job is finished.
                  // Say so directly instead of running another slow model pass that may
                  // re-propose the same change and wait on another Accept prompt.
                  const rejectedByUser = result.output.startsWith('The user rejected');
                  if (toolName === 'apply' && !parseError && (!result.isError || rejectedByUser)) {
                      const target = (toolArgs as any).path;
                      finalCombinedResponse += rejectedByUser
                          ? `\nOkay, I left \`${target}\` unchanged.`
                          : `\n${this._describeApplied(target, applyCheck)}`;
                      shouldStop = true;
                  }

                  syncUI();

                  if (shouldStop) {
                      break;
                  }

              } else {
                  // The model may claim a change without calling apply or showing any code.
                  // Do not show that claim; nudge it once to actually do the work.
                  const editor = vscode.window.activeTextEditor;
                  const hasCode = parseCodeBlocks(currentTurnResponse).some(b => !isTerminalLanguage(b.language));

                  if (!nudged && editor && !hasCode && this._isCodeChangeRequest(userMsg)) {
                      nudged = true;
                      syncUI();
                      fullPrompt += `${currentTurnResponse}\n\nSystem: You have not changed any file yet. Do it now.\n${this._applyReminder(editor, userMsg)}\n\nResponse:`;
                      continue;
                  }

                  // No more tool calls, we are done
                  finalCombinedResponse += currentTurnResponse;
                  break;
              }

          } catch (e: any) {
              flush();
              if (e.name === 'AbortError' || signal.aborted) {
                  wasCancelled = true;
              } else {
                  const errorMsg = `\n\n⚠️ **Error**: ${e.message}`;
                  finalCombinedResponse += errorMsg;
                  // Force a fresh connection check next time.
                  this._lastConnectionOkAt = 0;
              }
              break;
          }
      }

      flush();

      if (wasCancelled) {
          // Keep whatever was already done so the user can see it, marked as stopped.
          finalCombinedResponse = `${finalCombinedResponse.trim()}\n\n_Stopped._`.trim();
          this._currentSession.messages.push({ role: 'ai', content: finalCombinedResponse, timestamp: Date.now() });
          this._saveHistory();
          this._abortController = null;
          this._currentImage = null;
          webview.postMessage({type: 'agentSet', value: finalCombinedResponse});
          webview.postMessage({type: 'agentEnd'});
          webview.postMessage({type: 'status', value: ''});
          return;
      }

      if (finalCombinedResponse.trim() === '') {
          finalCombinedResponse =
              "⚠️ **Error**: Received an empty response from the AI. The API might be rate limited, or the selected model may not exist/be supported.";
      }

      this._currentSession.messages.push({
          role: 'ai',
          content: finalCombinedResponse,
          timestamp: Date.now()
      });
      this._saveHistory();
      this._abortController = null;
      this._currentImage = null;
      webview.postMessage({type: 'agentSet', value: finalCombinedResponse});
      webview.postMessage({type: 'agentEnd'});
      webview.postMessage({type: 'status', value: ''});

      // Fallback: if the model wrote a code block instead of calling apply, still offer the diff.
      if (this._isCodeChangeRequest(userMsg) && !finalCombinedResponse.includes('<tool_call name="apply"')) {
          this._tryAutoApply(finalCombinedResponse, webview, userMsg);
      }
  }

  private async _buildInitialPrompt(userMsg: string, attachments: string[] = []): Promise<string> {
    const editor = vscode.window.activeTextEditor;
    const systemPrompt = this._buildSystemPrompt(editor);
    const toolInstructions = this._toolManager.getToolDefinitions();
    const context = await this._buildFileContext(userMsg, editor, attachments);
    
    // Include past conversation history within this session
    // Only the most recent turns, each shortened, so local models don't spend
    // minutes re-reading old conversation on every message.
    // Old report-style replies are dropped: small models copy whatever format they see in history.
    const isOldReport = (m: ChatMessage) =>
        !!m.structuredReasoning || /(^|\n)\s*(#{1,3}\s*)?\**What changed\**/i.test(m.content);
    const history = this._currentSession.messages.slice(0, -1).filter(m => !isOldReport(m)).slice(-MAX_HISTORY_MESSAGES).map(m => {
        const content = m.role === 'ai' ? summarizeForHistory(m.content) : m.content;
        const text = content.length > MAX_HISTORY_CHARS
            ? `${content.substring(0, MAX_HISTORY_CHARS)}... [truncated]`
            : content;
        return `${m.role === 'user' ? 'User' : 'Assistant'}: ${text}`;
    }).join('\n\n');
    
    // Small models forget the tool format by the end of a long prompt, so repeat it next to the question.
    const reminder = this._isCodeChangeRequest(userMsg) && editor
        ? `\n\n${this._applyReminder(editor, userMsg)}`
        : '';

    return `${systemPrompt}\n\n${toolInstructions}\n\n${context}\n\nConversation History:\n${history || '(No previous messages)'}\n\nUser Question: ${userMsg}${reminder}\n\nResponse:`;
  }

  /** Short instruction showing the exact apply call for the file the user has open. */
  private _applyReminder(editor: vscode.TextEditor, userMsg = ''): string {
    // Without a workspace folder, asRelativePath returns a long absolute path; the file name is enough.
    const target = vscode.workspace.workspaceFolders?.length
        ? vscode.workspace.asRelativePath(editor.document.uri, false)
        : path.basename(editor.document.fileName);
    const current = editor.document.getText();
    const rule = classifyEditIntent(userMsg) === 'add'
        ? `The user wants code ADDED. Keep every current line of ${target} exactly as it is and add the new code (at the end unless they said where).`
        : `Change only what the user asked for. Keep every other line of ${target} exactly as it is.`;
    const currentBlock = current.length <= 4000
        ? `Current contents of ${target}:\n\`\`\`\n${current}\n\`\`\`\n`
        : '';
    return `${currentBlock}${rule}\nAnswer with one short first-person sentence saying what you will do, followed by:\n<tool_call name="apply" path="${target}">\n[complete new contents of ${target}]\n</tool_call>`;
  }

  /**
   * Checks an apply call against the request before showing it. For an "add"
   * request, existing lines the model dropped are put back.
   */
  private async _checkApply(userMsg: string, args: { path?: string; code?: string }): Promise<{ code: string; original: string; restoredLines: number }> {
    const code = typeof args.code === 'string' ? args.code : '';
    let original = '';
    try {
      const fullPath = await resolveWorkspacePath(args.path ?? '');
      const open = vscode.workspace.textDocuments?.find(d => d.uri.fsPath === fullPath);
      original = open ? open.getText() : await fs.promises.readFile(fullPath, 'utf8');
    } catch {
      // New file or unreadable path: nothing to protect.
      return { code, original: '', restoredLines: 0 };
    }

    if (original.trim() === '' || classifyEditIntent(userMsg) !== 'add') {
      return { code, original, restoredLines: 0 };
    }
    const preserved = preserveExistingCode(original, code);
    if (preserved.restoredLines > 0) {
      log(`Apply guard: restored ${preserved.restoredLines} line(s) the model dropped from ${args.path}`);
    }
    return { code: preserved.content, original, restoredLines: preserved.restoredLines };
  }

  /** One honest sentence about what was saved, based on the actual diff. */
  private _describeApplied(target: string, check: { code: string; original: string; restoredLines: number } | null): string {
    if (!check) {
      return `Done. I saved the change to \`${target}\`.`;
    }
    const { added, removed } = countLineChanges(check.original, check.code);
    const plural = (n: number) => `${n} line${n === 1 ? '' : 's'}`;
    let sentence: string;
    if (check.original.trim() === '') {
      sentence = `Done. I wrote ${plural(added)} to \`${target}\`.`;
    } else if (removed === 0) {
      sentence = `Done. I added ${plural(added)} to \`${target}\` and kept the existing code.`;
    } else {
      sentence = `Done. I updated \`${target}\` (+${added} / -${removed} lines).`;
    }
    if (check.restoredLines > 0) {
      sentence += ` The draft had dropped ${plural(check.restoredLines)} of your existing code, so I kept them, since you only asked to add something.`;
    }
    return sentence;
  }

  /**
   * True when the user is asking Orbit to create or change code. Greetings,
   * questions and explanations return false and get a normal conversational reply.
   */
  private _isCodeChangeRequest(userMsg: string): boolean {
    return /\b(create|add|edit|modify|change|fix|refactor|rewrite|write|implement|update|replace|remove|delete|rename|optimi[sz]e|generate|apply|convert|migrate)\b/i.test(userMsg);
  }

  private async _buildFileContext(userMsg: string, editor?: vscode.TextEditor, attachments: string[] = []): Promise<string> {
    const sections: string[] = ['Workspace Context:'];

    // Files attached with the paperclip are read directly, workspace folder or not.
    for (const filePath of attachments) {
      try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const truncated = content.length > MAX_ATTACHMENT_CHARS
          ? `${content.slice(0, MAX_ATTACHMENT_CHARS)}\n... [TRUNCATED]`
          : content;
        sections.push(`Attached file: ${filePath}\n\`\`\`\n${truncated}\n\`\`\``);
      } catch (error: any) {
        sections.push(`Attached file could not be read: ${filePath} (${error.message})`);
      }
    }

    if (editor) {
      const selection = editor.selection;
      const selectedText = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
      const truncated = selectedText.length > 4000
        ? `${selectedText.slice(0, 4000)}\n... [TRUNCATED]`
        : selectedText;
      sections.push(`Active file: ${editor.document.fileName}\n\`\`\`${editor.document.languageId}\n${truncated}\n\`\`\``);
    }

    const references = await this._fileParser.parse(userMsg);
    const seen = new Set<string>();
    for (const reference of references) {
      if (!reference.isValid || seen.has(reference.path)) {
        continue;
      }

      seen.add(reference.path);
      this._fileManager.addRecentFile(reference.path);
      try {
        const file = await this._fileReader.read(reference.path, {
          lineRange: reference.lineRange
        });
        const truncated = file.content.length > 4000
          ? `${file.content.slice(0, 4000)}\n... [TRUNCATED]`
          : file.content;
        sections.push(`Referenced file: ${reference.path}\n\`\`\`\n${truncated}\n\`\`\``);
      } catch (error: any) {
        sections.push(`Referenced file could not be read: ${reference.path} (${error.message})`);
      }
    }

    return sections.join('\n\n');
  }

  private async _getCurrentImagePayload(): Promise<string[] | undefined> {
    if (!this._currentImage) {
      return undefined;
    }

    try {
      const image = await fs.promises.readFile(this._currentImage);
      return [`data:${this._getMimeType(this._currentImage)};base64,${image.toString('base64')}`];
    } catch (error) {
      console.error('Failed to read attached image:', error);
      return undefined;
    }
  }


  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._context.extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Initial model list fetch
    this._sendModelList(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'refreshModels': {
          await this._sendModelList(webviewView.webview);
          break;
        }
        case 'webviewReady': {
          log('Received webviewReady, sending model list and history');
          await this._sendConnectionStatus(webviewView.webview);
          await this._sendModelList(webviewView.webview);
          await this._sendHistory(webviewView.webview);
          break;
        }
        case 'getHistory': {
          await this._sendHistory(webviewView.webview);
          break;
        }
        case 'loadSession': {
          const sessionId = data.value;
          const history = this._context.globalState.get<ChatSession[]>('chatHistory', []);
          const session = history.find(s => s.id === sessionId);
          if (session) {
            this._currentSession = session;
            this._currentImage = null;
            webviewView.webview.postMessage({ type: 'loadChat', value: session.messages });
          }
          break;
        }
        case 'deleteSession': {
          const sessionId = data.value;
          let history = this._context.globalState.get<ChatSession[]>('chatHistory', []);
          history = history.filter(s => s.id !== sessionId);
          await this._context.globalState.update('chatHistory', history);
          // If we deleted the current session, start a new one
          if (this._currentSession.id === sessionId) {
            this.clearChat();
          }
          await this._sendHistory(webviewView.webview);
          break;
        }
        case 'error': {
          vscode.window.showErrorMessage(data.value);
          break;
        }
        case 'changeModel': {
          const config = vscode.workspace.getConfiguration('orbit');
          const model = data.value;
          const currentMode = config.get<string>('mode', 'cloud');
          
          if (currentMode === 'cloud' || currentMode === 'custom') {
            await config.update('onlineModel', model, vscode.ConfigurationTarget.Global);
          } else {
            await config.update('offlineModel', model, vscode.ConfigurationTarget.Global);
          }
          
          vscode.window.showInformationMessage(`Orbit: Model changed to ${model}`);
          
          // Trigger a new connection check
          await this._sendConnectionStatus(webviewView.webview);
          break;
        }
        case 'pullModel': {
          const modelName = data.value;
          if (!modelName) {return;}

          const terminal = vscode.window.createTerminal(`Orbit: Pull ${modelName}`);
          terminal.show();
          terminal.sendText(`ollama pull ${modelName}`);

          // Wait a bit and refresh list
          setTimeout(() => this._sendModelList(webviewView.webview), 5000);
          break;
        }
        case 'cancelGeneration': {
          if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
            // A diff waiting for Accept/Reject would otherwise keep the agent stuck.
            if (this._inlineApply.hasPendingProposal) {
              await this._inlineApply.reject();
            }
            webviewView.webview.postMessage({ type: 'status', value: 'Generation cancelled.' });
          }
          break;
        }
        case 'sendMessage': {
          const userMsg = data.value;
          const attachments: string[] = Array.isArray(data.attachments) ? data.attachments : [];
          await this._processMessage(userMsg, webviewView.webview, false, attachments);
          break;
        }
        case 'selectImage': {
          const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select Image',
            filters: {
              'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp']
            }
          };
          vscode.window.showOpenDialog(options).then(async fileUri => {
            if (fileUri && fileUri[0]) {
              this._currentImage = fileUri[0].fsPath;
              try {
                const imageBuffer = await vscode.workspace.fs.readFile(fileUri[0]);
                const base64 = Buffer.from(imageBuffer).toString('base64');
                const mimeType = this._getMimeType(fileUri[0].fsPath);
                webviewView.webview.postMessage({
                  type: 'imageSelected',
                  value: `data:${mimeType};base64,${base64}`
                });
              } catch (e) {
                console.error('Error reading image for preview:', e);
              }
            }
          });
          break;
        }
        case 'pasteImage': {
          try {
            const base64Data = data.value;
            if (!base64Data) {return;}

            const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
              return;
            }
            const base64Image = matches[2];
            const buffer = Buffer.from(base64Image, 'base64');

            const tempDir = os.tmpdir();
            const fileName = `devmind_pasted_${Date.now()}.png`;
            const filePath = path.join(tempDir, fileName);

            await fs.promises.writeFile(filePath, buffer);

            this._currentImage = filePath;
            // Send back the original data URI for preview
            webviewView.webview.postMessage({ type: 'imageSelected', value: base64Data });
          } catch (e: any) {
            console.error('Failed to save pasted image:', e);
            vscode.window.showErrorMessage('Failed to paste image');
          }
          break;
        }
        case 'clearImage': {
          this._currentImage = null;
          break;
        }
        case 'insertCode': {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            editor.edit(editBuilder => {
              if (editor.selection.isEmpty) {
                editBuilder.insert(editor.selection.active, data.value);
              } else {
                editBuilder.replace(editor.selection, data.value);
              }
            });
          } else {
            vscode.window.showWarningMessage('Open a file to insert code.');
          }
          break;
        }
        case 'copyCode': {
          vscode.env.clipboard.writeText(data.value);
          vscode.window.showInformationMessage('Code copied to clipboard');
          break;
        }
        case 'applyCode': {
          const activeEditor = vscode.window.activeTextEditor;
          if (!activeEditor) {
            vscode.window.showWarningMessage('Orbit: Open a file first to apply code changes.');
            break;
          }

          const targetPath = activeEditor.document.uri.fsPath;
          const proposedCode = data.value;

          // If there's already a pending proposal, reject it first
          if (this._inlineApply.hasPendingProposal) {
            await this._inlineApply.reject();
          }

          webviewView.webview.postMessage({ type: 'status', value: 'Applying changes...' });

          try {
            const accepted = await this._inlineApply.proposeChange(targetPath, proposedCode);
            webviewView.webview.postMessage({
              type: 'addResponse',
              value: accepted
                ? '✅ Changes accepted and applied.'
                : '❌ Changes rejected — file restored.'
            });
          } catch (e: any) {
            webviewView.webview.postMessage({ type: 'addResponse', value: `Error applying code: ${e.message}` });
          } finally {
            webviewView.webview.postMessage({ type: 'status', value: '' });
          }
          break;
        }
        case 'runCommand': {
          const cmd = data.value;
          if (!cmd) {break;}

          webviewView.webview.postMessage({ type: 'status', value: 'Running command...' });

          try {
            const result = await this._terminalService.runWithConfirmation(cmd);
            if (result === null) {
              webviewView.webview.postMessage({ type: 'addResponse', value: '⚠️ Command cancelled by user.' });
            } else {
              let output = '';
              if (result.stdout) {output += result.stdout;}
              if (result.stderr) {output += (output ? '\n' : '') + result.stderr;}
              const exitLabel = result.exitCode === 0 ? '✅ Success' : `❌ Exit code: ${result.exitCode}`;
              webviewView.webview.postMessage({
                type: 'addResponse',
                value: `${exitLabel}\n\`\`\`\n${output || '(no output)'}\n\`\`\``
              });
            }
          } catch (e: any) {
            webviewView.webview.postMessage({ type: 'addResponse', value: `Error running command: ${e.message}` });
          } finally {
            webviewView.webview.postMessage({ type: 'status', value: '' });
          }
          break;
        }
        case 'newChat': {
          this.clearChat();
          break;
        }
        case 'openHistory': {
          this.showHistory();
          break;
        }
        case 'openSettings': {
          this.handleHeaderOption('customizations');
          break;
        }
        case 'openFilePicker': {
          const filePath = await this._pickFile();
          if (filePath) {
            this._fileManager.addRecentFile(filePath);
            webviewView.webview.postMessage({
              type: 'fileAttached',
              value: { path: filePath, name: path.basename(filePath) }
            });
          }
          break;
        }
      }
    });
  }

  /**
   * Lets the user pick a file to attach: recent files, workspace files, or any
   * file on disk through the system dialog (works without an open folder).
   */
  private async _pickFile(): Promise<string | undefined> {
    const BROWSE = '$(folder-opened) Browse files on disk...';
    const items: vscode.QuickPickItem[] = [{ label: BROWSE, alwaysShow: true }];

    const recent = this._fileManager.getRecentFiles();
    if (recent.length > 0) {
      items.push({ label: 'Recent', kind: vscode.QuickPickItemKind.Separator });
      recent.forEach(f => items.push({ label: path.basename(f.path), description: f.relativePath, detail: f.path }));
    }

    if (vscode.workspace.workspaceFolders?.length) {
      const files = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/dist/**,**/out/**}', 500);
      if (files.length > 0) {
        items.push({ label: 'Workspace', kind: vscode.QuickPickItemKind.Separator });
        files.forEach(f => items.push({
          label: path.basename(f.fsPath),
          description: vscode.workspace.asRelativePath(f, false),
          detail: f.fsPath
        }));
      }
    }

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Attach a file to your message',
      matchOnDescription: true
    });
    if (!selected) {
      return undefined;
    }
    if (selected.label === BROWSE) {
      const uris = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Attach' });
      return uris?.[0]?.fsPath;
    }
    return selected.detail;
  }

  // Public methods for external commands
  public clearChat() {
    this._saveHistory(); // Save before clearing
    this._currentSession = this._createNewSession();
    this._currentImage = null;
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this._webviewView?.webview.postMessage({ type: 'clearChat' });
  }

  public async showHistory() {
    const history = this._context.globalState.get<ChatSession[]>('chatHistory', []);
    if (history.length === 0) {
      vscode.window.showInformationMessage('No chat history found.');
      return;
    }

    const items = history.map(session => ({
      label: session.title,
      description: new Date(session.lastModified).toLocaleString(),
      session: session
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a chat session to load'
    });

    if (selected) {
      this._currentSession = selected.session;
      this._currentImage = null; // Clear image when loading history
      this._webviewView?.webview.postMessage({ type: 'loadChat', value: this._currentSession.messages });
    }
  }

  public handleHeaderOption(option: string) {
    switch (option) {
      case 'customizations':
        vscode.commands.executeCommand('workbench.action.openSettings', 'Orbit');
        break;
    }
  }

  private async _sendConnectionStatus(webview: vscode.Webview) {
    webview.postMessage({ type: 'updateConnectionState', value: { ok: false, message: 'Checking...' } });
    const status = await this._llmClient.checkConnection();
    webview.postMessage({ type: 'updateConnectionState', value: status });
  }

  private async _sendModelList(webview: vscode.Webview) {
    try {
      const models = await this._llmClient.listModels();

      const config = vscode.workspace.getConfiguration('orbit');
      const currentMode = config.get<string>('mode', 'cloud');
      const isOffline = currentMode === 'offline';
      let currentModel = config.get<string>(isOffline ? 'offlineModel' : 'onlineModel') || '';

      // Auto-sync: if the configured model isn't installed/available, switch to the first available one
      if (models.length > 0 && (!currentModel || !models.includes(currentModel))) {
        currentModel = models[0];
        await config.update(isOffline ? 'offlineModel' : 'onlineModel', currentModel, vscode.ConfigurationTarget.Global);
        log(`Orbit: Auto-selected model "${currentModel}" (previous model not found)`);
      }

      webview.postMessage({
        type: 'updateModels',
        value: {
          models: models,
          current: currentModel
        }
      });
    } catch (e: any) {
      // Just send empty list or error state
      webview.postMessage({ type: 'modelListError', value: e.message });
    }
  }

  private async _sendHistory(webview: vscode.Webview) {
    const history = this._context.globalState.get<ChatSession[]>('chatHistory', []);
    // Send lightweight metadata for history list
    const sessionList = history.map(s => ({
      id: s.id,
      title: s.title,
      lastModified: s.lastModified,
      messageCount: s.messages.length
    }));
    webview.postMessage({ type: 'updateHistory', value: sessionList });
  }

  /**
   * Builds a system prompt that guides the AI to produce apply-ready code responses.
   */
  private _buildSystemPrompt(editor?: vscode.TextEditor): string {
    const parts = [
      'You are Orbit, an AI coding agent working inside the user\'s VS Code. You talk like a helpful senior teammate: friendly, direct and brief.',
      '',
      '## How you work',
      '- Reply to greetings and questions in a few natural sentences. No headings, no reports, no bullet-point essays.',
      '- You are an agent: act, do not just advise. When the user wants something done, say in one short first-person sentence what you are going to do (e.g. "I\'ll add a print statement at the end of hello.js."), then do it with a tool. Do not repeat the user\'s message back to them.',
      '- Gather what you need first: use ls, read or search to look at files you have not seen, instead of guessing their contents.',
      '- Use one tool per step. After each tool result, decide the next step yourself until the task is done.',
      '- When finished, tell the user in one or two sentences what you did and, if useful, what to try next.',
      '- Ask a short question only when you genuinely cannot proceed.',
      '- Use markdown: `inline code` for names and paths, fenced code blocks for code.',
      '',
      '## Changing files',
      '- To create, edit, fix or write code in a file, you MUST call the apply tool with the file path and the complete resulting file contents.',
      '- If the user says "the file" or "this file", they mean the file they currently have open.',
      '- Keep every existing line of the file unless the user explicitly asked to change or remove it. To add code, send the current contents plus the new code.',
      '- Do only what the user asked. Do not delete, rename or rewrite unrelated code.',
      '- The user sees a diff and approves it before anything is saved. NEVER say a file was changed unless the apply tool result says it was saved.',
      '- If the apply result says the change was rejected or failed, say so honestly and offer to adjust.',
      '- If the user only wants an explanation or an example, answer in chat and do not touch files.',
      '',
      '## Terminal & Commands',
      '- For shell commands, use: ```bash',
      '- Terminal blocks will show a "Run" button in the UI.',
      '',
      '## Context Awareness',
      'You can see the current open file and any files the user explicitly references or attaches.',
      '',
      '## Communication Style',
      '- Keep answers short and readable. Summarize findings; do not dump raw data.',
    ];

    if (editor) {
      const fileName = path.basename(editor.document.fileName);
      const language = editor.document.languageId;
      parts.push(`The user is currently editing: ${fileName} (${language})`);
    }

    return parts.join('\n');
  }

  /**
   * After AI response completes, check if it contains a single code block
   * that matches the active file — if so, auto-open the diff view.
   */
  private async _tryAutoApply(aiResponse: string, webview: vscode.Webview, userMsg = '') {
    try {
      const blocks = parseCodeBlocks(aiResponse);
      // Filter to non-terminal code blocks
      const codeBlocks = blocks.filter(b => !isTerminalLanguage(b.language));

      if (codeBlocks.length !== 1) {return;} // Only auto-apply for single code block responses

      const block = codeBlocks[0];
      const editor = vscode.window.activeTextEditor;
      if (!editor) {return;}

      const activeFile = editor.document.fileName;

      // Check if the block targets this file (by filepath annotation or language match)
      const matchesByPath = block.filePath && activeFile.endsWith(block.filePath.replace(/\//g, path.sep));
      const matchesByLang = !block.filePath && languageMatchesFile(block.language, activeFile);

      if (!matchesByPath && !matchesByLang) {return;}

      // The diff's Accept / Reject prompt is the approval step, so go straight to it.
      if (this._inlineApply.hasPendingProposal) {
        await this._inlineApply.reject();
      }

      const check = await this._checkApply(userMsg, { path: activeFile, code: block.code });
      const accepted = await this._inlineApply.proposeChange(activeFile, check.code);
      webview.postMessage({
        type: 'addResponse',
        value: accepted
          ? `✅ Saved your changes to ${path.basename(activeFile)}.`
          : `❌ Okay, I left ${path.basename(activeFile)} unchanged.`
      });
    } catch (e) {
      console.error('[ChatProvider] Auto-apply failed:', e);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const uiDistPath = path.join(this._context.extensionUri.fsPath, 'out', 'webview');
    const htmlPath = path.join(uiDistPath, 'index.html');

    let html = '';
    try {
      html = fs.readFileSync(htmlPath, 'utf8');
    } catch (err) {
      return `<html><body><h1>Error loading UI</h1><p>${err}</p></body></html>`;
    }

    const baseUri = webview.asWebviewUri(vscode.Uri.file(uiDistPath));
    const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'codicon.css'));
    const codiconFontUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'codicon.ttf'));

    // Relax CSP to allow Vite modules to load correctly
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-eval'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data: https:; connect-src ${webview.cspSource} https:;`;

    // Patch the HTML
    // 1. Inject CSP
    html = html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`);
    
    // 2. Inject codicons - override @font-face with correct webview URI for the .ttf font,
    //    then load the CSS for icon class definitions
    html = html.replace('</head>', `<style>@font-face { font-family: "codicon"; font-display: block; src: url("${codiconFontUri}") format("truetype"); }</style><link href="${codiconsUri}" rel="stylesheet"></head>`);

    // 3. Convert root-relative paths to webview URIs
    // Matches src="/index.js" or href="/index.css"
    html = html.replace(
      /(src|href)="(?:\.\/|\/)?([^"]+)"/g,
      (match, attr, filePath) => {
        if (filePath.startsWith('http') || filePath.startsWith('data:')) {return match;}
        return `${attr}="${baseUri}/${filePath}"`;
      }
    );

    return html;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
