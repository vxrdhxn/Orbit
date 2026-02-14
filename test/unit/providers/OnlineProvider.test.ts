import { OnlineProvider } from '../../../src/providers/OnlineProvider';
import { Context, Message } from '../../../src/providers/types';

// Mock global fetch
global.fetch = jest.fn();

describe('OnlineProvider', () => {
    const endpoint = 'https://api.example.com';
    const apiKey = 'test-key';
    let provider: OnlineProvider;

    beforeEach(() => {
        provider = new OnlineProvider(endpoint, apiKey);
        (global.fetch as jest.Mock).mockClear();
    });

    test('isAvailable returns true on success', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true
        });

        const result = await provider.isAvailable();
        expect(result).toBe(true);
        // Note: The implementation currently might return true optimistically or check localhost, 
        // but if we uncomment the fetch logic in the future this test is ready. 
        // Current impl checks for localhost/127 for testing or returns true.
        // Let's verify it returns true for now.
    });

    test('chat sends correct request', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'response' } }],
                model: 'gpt-4',
                usage: { total_tokens: 10 }
            })
        });

        const messages: Message[] = [{ role: 'user', content: 'hello' }];
        const context: Context = { activeFile: 'test.ts' };

        const response = await provider.chat(messages, context);

        expect(global.fetch).toHaveBeenCalledWith(
            `${endpoint}/chat/completions`,
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': `Bearer ${apiKey}`
                }),
                body: expect.stringContaining('"messages":')
            })
        );
        expect(response.content).toBe('response');
    });

    test('chat throws on error', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            statusText: 'Unauthorized'
        });

        const messages: Message[] = [{ role: 'user', content: 'hello' }];
        const context: Context = {};

        await expect(provider.chat(messages, context)).rejects.toThrow('Online provider failed: Unauthorized');
    });
});
