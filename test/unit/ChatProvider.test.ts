import * as vscode from 'vscode';
import { ChatProvider } from '../../src/ChatProvider';

describe('ChatProvider agent loop', () => {
    let provider: ChatProvider;
    let llmClient: any;
    let context: any;

    beforeEach(() => {
        jest.clearAllMocks();

        llmClient = {
            checkConnection: jest.fn().mockResolvedValue({
                ok: true,
                canBootstrap: false,
            }),
            generateStream: jest.fn(),
        };

        context = {
            globalState: {
                get: jest.fn().mockReturnValue([]),
                update: jest.fn().mockResolvedValue(undefined),
            },

            workspaceState: {
                get: jest.fn().mockReturnValue([]),
                update: jest.fn().mockResolvedValue(undefined),
            },
        };

        provider = new ChatProvider(context, llmClient);
    });

    it('should parse a valid tool call and execute the tool', async () => {
        llmClient.generateStream
            .mockImplementationOnce(async (_prompt: string, onChunk: Function) => {
                onChunk(
                    '<tool_call name="read">{"path":"src/example.ts"}</tool_call>'
                );
            })
            .mockImplementationOnce(async (_prompt: string, onChunk: Function) => {
                onChunk('The file contains the requested code.');
            });

        const toolManager = (provider as any)._toolManager;

        jest.spyOn(toolManager, 'callTool').mockResolvedValue({
            output: 'const example = true;',
            isError: false,
        });

        const webview = {
            postMessage: jest.fn(),
        } as any;

        await (provider as any)._processMessage(
            'Read src/example.ts',
            webview
        );

        expect(toolManager.callTool).toHaveBeenCalledWith('read', {
            path: 'src/example.ts',
        });

        expect(llmClient.generateStream).toHaveBeenCalledTimes(2);
    });

    it('should handle malformed tool-call JSON', async () => {
        llmClient.generateStream.mockImplementationOnce(
            async (_prompt: string, onChunk: Function) => {
                onChunk(
                    '<tool_call name="read">{invalid json}</tool_call>'
                );
            }
        );

        const webview = {
            postMessage: jest.fn(),
        } as any;

        await (provider as any)._processMessage(
            'Read the file',
            webview
        );

        expect(
            webview.postMessage
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'status',
                value: 'Calling read...',
            })
        );

        expect(llmClient.generateStream).toHaveBeenCalledTimes(1);
    });

    it('should pass unknown tools to ToolManager', async () => {
        llmClient.generateStream.mockImplementationOnce(
            async (_prompt: string, onChunk: Function) => {
                onChunk(
                    '<tool_call name="doesNotExist">{"value":"test"}</tool_call>'
                );
            }
        );

        const toolManager = (provider as any)._toolManager;

        jest.spyOn(toolManager, 'callTool').mockResolvedValue({
            output: 'Unknown tool: doesNotExist',
            isError: true,
        });

        const webview = {
            postMessage: jest.fn(),
        } as any;

        await (provider as any)._processMessage(
            'Use the unknown tool',
            webview
        );

        expect(toolManager.callTool).toHaveBeenCalledWith(
            'doesNotExist',
            { value: 'test' }
        );
    });

    it('should stop when the model returns a normal response', async () => {
        llmClient.generateStream.mockImplementationOnce(
            async (_prompt: string, onChunk: Function) => {
                onChunk('Here is the answer.');
            }
        );

        const webview = {
            postMessage: jest.fn(),
        } as any;

        await (provider as any)._processMessage(
            'Explain something',
            webview
        );

        expect(llmClient.generateStream).toHaveBeenCalledTimes(1);
    });
});

describe('ChatProvider streaming', () => {
    it('streams the reply live and ends the turn', async () => {
        const context: any = {
            globalState: { get: jest.fn().mockReturnValue([]), update: jest.fn().mockResolvedValue(undefined) },
            workspaceState: { get: jest.fn().mockReturnValue([]), update: jest.fn() },
        };
        const llmClient: any = {
            checkConnection: jest.fn().mockResolvedValue({ ok: true }),
            generateStream: jest.fn(async (_p: string, onChunk: Function) => {
                onChunk('Hello ');
                onChunk('there');
            }),
        };
        const provider: any = new ChatProvider(context, llmClient);
        const webview = { postMessage: jest.fn() } as any;

        await provider._processMessage('hi', webview);

        const types = webview.postMessage.mock.calls.map((c: any[]) => c[0].type);
        expect(types[0]).toBe('agentStart');
        expect(types).toContain('agentDelta');
        expect(types).toContain('agentEnd');
        const finalSet = webview.postMessage.mock.calls.map((c: any[]) => c[0]).filter((m: any) => m.type === 'agentSet').pop();
        expect(finalSet.value).toBe('Hello there');
    });

    it('records the tool call and its result in the visible turn', async () => {
        const context: any = {
            globalState: { get: jest.fn().mockReturnValue([]), update: jest.fn().mockResolvedValue(undefined) },
            workspaceState: { get: jest.fn().mockReturnValue([]), update: jest.fn() },
        };
        const llmClient: any = {
            checkConnection: jest.fn().mockResolvedValue({ ok: true }),
            generateStream: jest.fn()
                .mockImplementationOnce(async (_p: string, onChunk: Function) => {
                    // No closing tag: the local worker stops on it.
                    onChunk('Reading.<tool_call name="read">{"path":"a.ts"}');
                })
                .mockImplementationOnce(async (_p: string, onChunk: Function) => {
                    onChunk('It exports a.');
                }),
        };
        const provider: any = new ChatProvider(context, llmClient);
        jest.spyOn(provider._toolManager, 'callTool').mockResolvedValue({ output: 'export const a = 1;' });
        const webview = { postMessage: jest.fn() } as any;

        await provider._processMessage('what is in a.ts?', webview);

        const saved = provider._currentSession.messages.pop().content;
        expect(saved).toContain('<tool_call name="read">{"path":"a.ts"}</tool_call>');
        expect(saved).toContain('<observation status="ok">');
        expect(saved).toContain('It exports a.');
    });

    it('keeps tool traffic out of the prompt history', () => {
        const { summarizeForHistory } = require('../../src/ChatProvider');
        const text = 'Done.<tool_call name="apply" path="a.js">lots of code</tool_call><observation status="ok">saved</observation>';
        expect(summarizeForHistory(text)).toBe('Done.');
        // Old saved replies may contain the previous placeholder notes; they must not reach the model.
        expect(summarizeForHistory('Write it. [edited hello.js]\nDone.')).toBe('Write it.\nDone.');
    });
});

describe('ChatProvider apply that changes nothing', () => {
    it('does not claim success and does not open a review', async () => {
        const vscode = require('vscode');
        vscode.workspace.textDocuments = [{ uri: { fsPath: require('path').resolve('/mock/root/hello.js') }, getText: () => "console.log('hi');\n" }];
        const context: any = {
            globalState: { get: jest.fn().mockReturnValue([]), update: jest.fn().mockResolvedValue(undefined) },
            workspaceState: { get: jest.fn().mockReturnValue([]), update: jest.fn() },
        };
        const llmClient: any = {
            checkConnection: jest.fn().mockResolvedValue({ ok: true }),
            // A placeholder instead of real code, twice in a row.
            generateStream: jest.fn(async (_p: string, onChunk: Function) => {
                onChunk('I will fix it.<tool_call name="apply" path="hello.js">[complete new contents of hello.js]</tool_call>');
            }),
        };
        const provider: any = new ChatProvider(context, llmClient);
        const callTool = jest.spyOn(provider._toolManager, 'callTool');
        const webview = { postMessage: jest.fn() } as any;

        await provider._processMessage('rewrite hello.js', webview);

        expect(callTool).not.toHaveBeenCalled();
        const saved = provider._currentSession.messages.pop().content;
        expect(saved).not.toContain('Done.');
        expect(saved).toContain("I couldn't produce that change");
        delete vscode.workspace.textDocuments;
    });
});

describe('ChatProvider system prompt', () => {
    it('requires the apply tool for file modifications', () => {
        const context: any = {
            globalState: { get: jest.fn().mockReturnValue([]), update: jest.fn() },
            workspaceState: { get: jest.fn().mockReturnValue([]), update: jest.fn() },
        };
        const provider: any = new ChatProvider(context, {} as any);

        const prompt: string = provider._buildSystemPrompt();

        expect(prompt).toContain('you MUST call the apply tool');
        expect(prompt).toContain('NEVER say a file was changed unless the apply tool result says it was saved');
    });

    it('asks for a conversational agent style, not a report', () => {
        const context: any = {
            globalState: { get: jest.fn().mockReturnValue([]), update: jest.fn() },
            workspaceState: { get: jest.fn().mockReturnValue([]), update: jest.fn() },
        };
        const provider: any = new ChatProvider(context, {} as any);

        const prompt: string = provider._buildSystemPrompt();

        expect(prompt).toContain('No headings, no reports');
    });

    it('drops old report-style replies from the prompt history', async () => {
        const context: any = {
            globalState: { get: jest.fn().mockReturnValue([]), update: jest.fn() },
            workspaceState: { get: jest.fn().mockReturnValue([]), update: jest.fn() },
        };
        const provider: any = new ChatProvider(context, {} as any);
        provider._buildFileContext = jest.fn().mockResolvedValue('');
        provider._currentSession.messages = [
            { role: 'user', content: 'hello', timestamp: 1 },
            { role: 'ai', content: '### What changed\n- nothing\n### Why\nbecause', timestamp: 2 },
            { role: 'ai', content: 'Hi! How can I help?', timestamp: 3 },
            { role: 'user', content: 'what is a closure?', timestamp: 4 },
        ];

        const prompt: string = await provider._buildInitialPrompt('what is a closure?');

        expect(prompt).not.toContain('What changed');
        expect(prompt).toContain('Hi! How can I help?');
    });

    it('only treats change-like messages as code-change requests', () => {
        const context: any = {
            globalState: { get: jest.fn().mockReturnValue([]), update: jest.fn() },
            workspaceState: { get: jest.fn().mockReturnValue([]), update: jest.fn() },
        };
        const provider: any = new ChatProvider(context, {} as any);

        expect(provider._isCodeChangeRequest('hello')).toBe(false);
        expect(provider._isCodeChangeRequest('what does this function do?')).toBe(false);
        expect(provider._isCodeChangeRequest("write a print statement which prints 'Hello'")).toBe(true);
    });
});
