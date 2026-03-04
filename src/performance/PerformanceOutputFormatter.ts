import { PerformanceAnalysis } from './types';

export class PerformanceOutputFormatter {
    public format(analysis: PerformanceAnalysis): string {
        let output = `╔════════════════════════════════════════════════════════════════════════╗\n`;
        output += `║                      ORBIT PERFORMANCE ANALYSIS                        ║\n`;
        output += `╚════════════════════════════════════════════════════════════════════════╝\n\n`;

        output += `─── ALGORITHMIC COMPLEXITY ───────────────────────────────────────────────\n`;
        output += `TIME COMPLEXITY:\n`;
        output += `  • Best Case:    ${analysis.timeComplexity.bestCase}\n`;
        output += `  • Average Case: ${analysis.timeComplexity.averageCase}\n`;
        output += `  • Worst Case:   ${analysis.timeComplexity.worstCase}\n`;
        output += `  Explanation:    ${analysis.timeComplexity.explanation}\n\n`;

        output += `SPACE COMPLEXITY:\n`;
        output += `  • Auxiliary:    ${analysis.spaceComplexity.auxiliary}\n`;
        output += `  • Total:        ${analysis.spaceComplexity.total}\n`;
        output += `  Explanation:    ${analysis.spaceComplexity.explanation}\n\n`;

        if (analysis.edgeCases.length > 0) {
            output += `─── POTENTIAL EDGE CASES ─────────────────────────────────────────────────\n`;
            analysis.edgeCases.forEach(edge => {
                output += `[!] SCENARIO: ${edge.scenario}\n`;
                output += `    Impact:   ${edge.impact}\n`;
                output += `    Mitigation: ${edge.mitigation}\n\n`;
            });
        }

        if (analysis.optimizations.length > 0) {
            output += `─── OPTIMIZATION SUGGESTIONS ─────────────────────────────────────────────\n`;
            analysis.optimizations.forEach(opt => {
                output += `[✓] TITLE: ${opt.title}\n`;
                output += `    Description: ${opt.description}\n`;
                output += `    Expected Improvement: ${opt.expectedImprovement}\n\n`;
            });
        }

        output += `─── STRUCTURED REASONING ─────────────────────────────────────────────────\n`;
        output += `WHAT: ${analysis.reasoning.what.join(', ')}\n`;
        output += `WHY: ${analysis.reasoning.why}\n`;
        output += `TRADE-OFFS: ${analysis.reasoning.tradeoffs}\n`;
        output += `PRODUCTION: ${analysis.reasoning.production}\n`;

        return output;
    }
}
