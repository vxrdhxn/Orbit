import { AIProvider, ProviderHealth } from './types';
import { StructuredProvider } from './StructuredProvider';
import { LLMRouter } from '../reasoning/LLMRouter';
import { ResponseFormatter } from '../reasoning/ResponseFormatter';

export class ProviderResolver {
    private currentProvider: AIProvider | null = null;
    private structuredOnline: AIProvider;
    private structuredLocal: AIProvider;

    constructor(
        private onlineProvider: AIProvider,
        private localProvider: AIProvider
    ) {
        const formatter = new ResponseFormatter();
        const router = new LLMRouter(formatter, { maxRetries: 2, enforceFormat: true });
        this.structuredOnline = new StructuredProvider(onlineProvider, router, formatter);
        this.structuredLocal = new StructuredProvider(localProvider, router, formatter);
    }

    async getProvider(): Promise<AIProvider> {
        // Check online first
        if (await this.onlineProvider.isAvailable()) {
            this.currentProvider = this.structuredOnline;
            return this.structuredOnline;
        }

        // Fallback to local
        if (await this.localProvider.isAvailable()) {
            this.currentProvider = this.structuredLocal;
            return this.structuredLocal;
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
            this.currentProvider = this.structuredOnline;
        } else if (local) {
            this.currentProvider = this.structuredLocal;
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
