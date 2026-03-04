import { EdgeCase } from './types';

export class EdgeCaseIdentifier {
    /**
     * Identifies potential edge cases for performance issues.
     * Heuristic-based approach to assist the LLM.
     */
    public identifyEdgeCases(code: string): EdgeCase[] {
        const edgeCases: EdgeCase[] = [];

        if (code.includes('.sort(')) {
            edgeCases.push({
                scenario: 'Large Nearly Sorted Input',
                impact: 'Worst-case performance for some sort algorithms (O(n^2))',
                mitigation: 'Use a stable Timsort-based implementation (default in JS)'
            });
        }

        if (code.includes('recursive') || code.includes('recursion')) {
            edgeCases.push({
                scenario: 'Deep Recursion',
                impact: 'Stack overflow for large input sizes',
                mitigation: 'Use tail recursion optimization or iterative approach'
            });
        }

        if (code.includes('.map(') && code.includes('.filter(')) {
            edgeCases.push({
                scenario: 'Large Array Chaining',
                impact: 'Multiple intermediate arrays created, high memory usage',
                mitigation: 'Combine map and filter or use a single loop'
            });
        }

        return edgeCases;
    }
}
