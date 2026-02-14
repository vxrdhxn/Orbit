import { LocalProvider } from '../../../src/providers/LocalProvider';
import { Context, Message } from '../../../src/providers/types';

global.fetch = jest.fn();

describe('LocalProvider', () => {
    const endpoint = 'http://localhost:11434';
    let provider: LocalProvider;

    beforeEach(() => {
        provider = new LocalProvider(endpoint);
        (global.fetch as jest.Mock).mockClear();
    });

    test('isAvailable checks /api/tags', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true
        });

        const result = await provider.isAvailable();
        expect(result).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(`${endpoint}/api/tags`);
    });

    test('chat sends correct request to /api/generate', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                response: 'ollama response'
            })
        });

        const messages: Message[] = [{ role: 'user', content: 'hello' }];
        const context: Context = {};

        const response = await provider.chat(messages, context);

        expect(global.fetch).toHaveBeenCalledWith(
            `${endpoint}/api/generate`,
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('"prompt":')
            })
        );
        expect(response.content).toBe('ollama response');
    });
});
