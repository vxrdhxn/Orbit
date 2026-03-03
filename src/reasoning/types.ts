export interface StructuredResponse {
    what: string[];
    why: string;
    improvements: string;
    tradeoffs: string;
    production: string;
}

export interface ValidationResult {
    isValid: boolean;
    missingSections: string[];
    errors: string[];
}

export interface LLMRouterConfig {
    maxRetries: number;
    enforceFormat: boolean;
}
