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
