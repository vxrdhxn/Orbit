import { ProviderResolver } from '../../../src/providers/ProviderResolver';
import { AIProvider, ChatResponse, Context, Message, ReviewComment, UnifiedDiff } from '../../../src/providers/types';
import * as fc from 'fast-check';

// Mock Provider Implementation
class MockProvider implements AIProvider {
    constructor(
        public readonly name: string,
        public readonly type: 'online' | 'local',
        private _isAvailable: boolean
    ) { }

    async isAvailable(): Promise<boolean> {
        return this._isAvailable;
    }

    async chat(messages: Message[], context: Context): Promise<ChatResponse> {
        return { content: 'mock', model: 'mock' };
    }
    async explain(code: string, context: Context): Promise<string> {
        return 'mock';
    }
    async review(code: string, context: Context): Promise<ReviewComment[]> {
        return [];
    }
    async generateDiff(code: string, instruction: string, context: Context): Promise<UnifiedDiff> {
        return { original: '', modified: '', diff: '' };
    }
}

describe('ProviderResolver', () => {
    test('should select online provider when available', async () => {
        const online = new MockProvider('Online', 'online', true);
        const local = new MockProvider('Local', 'local', true); // Local also available
        const resolver = new ProviderResolver(online, local);

        const provider = await resolver.getProvider();
        expect(provider.type).toBe('online');
        expect(provider.name).toBe('Online');
    });

    test('should fallback to local provider when online assumes unavailable', async () => {
        const online = new MockProvider('Online', 'online', false);
        const local = new MockProvider('Local', 'local', true);
        const resolver = new ProviderResolver(online, local);

        const provider = await resolver.getProvider();
        expect(provider.type).toBe('local');
        expect(provider.name).toBe('Local');
    });

    test('should throw error when neither is available', async () => {
        const online = new MockProvider('Online', 'online', false);
        const local = new MockProvider('Local', 'local', false);
        const resolver = new ProviderResolver(online, local);

        await expect(resolver.getProvider()).rejects.toThrow('No AI provider available');
    });

    // Property Based Test
    test('Property: Provider Selection Prioritization', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.boolean(), // onlineAvailable
                fc.boolean(), // localAvailable
                async (onlineAvailable, localAvailable) => {
                    const online = new MockProvider('Online', 'online', onlineAvailable);
                    const local = new MockProvider('Local', 'local', localAvailable);
                    const resolver = new ProviderResolver(online, local);

                    if (onlineAvailable) {
                        const provider = await resolver.getProvider();
                        expect(provider.type).toBe('online');
                    } else if (localAvailable) {
                        const provider = await resolver.getProvider();
                        expect(provider.type).toBe('local');
                    } else {
                        await expect(resolver.getProvider()).rejects.toThrow();
                    }
                }
            )
        );
    });
});
