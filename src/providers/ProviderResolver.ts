import { AIProvider, ProviderHealth } from './types';

export class ProviderResolver {
    private currentProvider: AIProvider | null = null;

    constructor(
        private onlineProvider: AIProvider,
        private localProvider: AIProvider
    ) { }

    async getProvider(): Promise<AIProvider> {
        // Check online first
        if (await this.onlineProvider.isAvailable()) {
            this.currentProvider = this.onlineProvider;
            return this.onlineProvider;
        }

        // Fallback to local
        if (await this.localProvider.isAvailable()) {
            this.currentProvider = this.localProvider;
            return this.localProvider;
        }

        throw new Error('No AI provider available');
    }

    getCurrentProvider(): AIProvider | null {
        return this.currentProvider;
    }

    async checkHealth(): Promise<ProviderHealth> {
        const online = await this.onlineProvider.isAvailable();
        const local = await this.localProvider.isAvailable();

        // Update active provider if needed (simple check)
        if (online) {
            this.currentProvider = this.onlineProvider;
        } else if (local) {
            this.currentProvider = this.localProvider;
        } else {
            this.currentProvider = null;
        }

        return {
            online,
            local,
            active: this.currentProvider?.name || 'none'
        };
    }
}
