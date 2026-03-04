import { StructuredResponse } from '../reasoning/types';

export interface PerformanceAnalysis {
    timeComplexity: {
        bestCase: string;
        averageCase: string;
        worstCase: string;
        explanation: string;
    };
    spaceComplexity: {
        auxiliary: string;
        total: string;
        explanation: string;
    };
    edgeCases: EdgeCase[];
    optimizations: Optimization[];
    reasoning: StructuredResponse;
}

export interface EdgeCase {
    scenario: string;
    impact: string;
    mitigation: string;
}

export interface Optimization {
    title: string;
    description: string;
    expectedImprovement: string;
    reasoning: StructuredResponse;
}
