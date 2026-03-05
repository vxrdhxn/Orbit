
import * as assert from 'assert';
import * as fc from 'fast-check';
import {
    ReviewReport,
    Finding,
    SeverityLevel,
    FindingCategory,
    QualityLevel,
    ReviewSummary,
    SuggestedFix,
    CodeLocation
} from '../reviewTypes';

describe('Code Review Property Tests', () => {

    // Generators
    const severityGen = fc.constantFrom(
        SeverityLevel.Critical,
        SeverityLevel.Warning,
        SeverityLevel.Info,
        SeverityLevel.Suggestion
    );

    const categoryGen = fc.constantFrom(
        FindingCategory.Bug,
        FindingCategory.Security,
        FindingCategory.Performance,
        FindingCategory.Style,
        FindingCategory.Maintainability,
        FindingCategory.BestPractice
    );

    const qualityGen = fc.constantFrom(
        QualityLevel.Excellent,
        QualityLevel.Good,
        QualityLevel.NeedsImprovement,
        QualityLevel.CriticalIssues
    );

    const locationGen = fc.record({
        fileName: fc.string({ minLength: 1 }),
        startLine: fc.integer({ min: 1 }),
        endLine: fc.integer({ min: 1 }),
        snippet: fc.string()
    }).map(loc => {
        // Ensure endLine >= startLine
        return {
            ...loc,
            endLine: Math.max(loc.startLine, loc.endLine)
        };
    });

    const fixGen = fc.record({
        description: fc.string({ minLength: 1 }),
        code: fc.string({ minLength: 1 }),
        diffPreview: fc.option(fc.string())
    });

    const findingGen = fc.record({
        id: fc.uuid(),
        category: categoryGen,
        severity: severityGen,
        title: fc.string({ minLength: 1 }),
        description: fc.string({ minLength: 1 }),
        location: locationGen,
        suggestedFix: fc.option(fixGen),
        references: fc.option(fc.array(fc.string()))
    });

    const summaryGen = fc.record({
        totalFindings: fc.integer({ min: 0 }),
        bySeverity: fc.record({
            [SeverityLevel.Critical]: fc.integer({ min: 0 }),
            [SeverityLevel.Warning]: fc.integer({ min: 0 }),
            [SeverityLevel.Info]: fc.integer({ min: 0 }),
            [SeverityLevel.Suggestion]: fc.integer({ min: 0 })
        }),
        byCategory: fc.record({
            [FindingCategory.Bug]: fc.integer({ min: 0 }),
            [FindingCategory.Security]: fc.integer({ min: 0 }),
            [FindingCategory.Performance]: fc.integer({ min: 0 }),
            [FindingCategory.Style]: fc.integer({ min: 0 }),
            [FindingCategory.Maintainability]: fc.integer({ min: 0 }),
            [FindingCategory.BestPractice]: fc.integer({ min: 0 })
        }),
        overallQuality: qualityGen,
        message: fc.string()
    });

    // Property 2: Finding structure validity
    test('Property 2: Finding structure validity', () => {
        fc.assert(
            fc.property(findingGen, (finding) => {
                return (
                    Object.values(FindingCategory).includes(finding.category) &&
                    Object.values(SeverityLevel).includes(finding.severity) &&
                    finding.description.length > 0 &&
                    finding.location.startLine > 0
                );
            })
        );
    });

    // Property 5: Fix structure validity
    test('Property 5: Fix structure validity', () => {
        fc.assert(
            fc.property(findingGen, (finding) => {
                if (finding.suggestedFix) {
                    return (
                        finding.suggestedFix.description.length > 0 &&
                        finding.suggestedFix.code.length > 0
                    );
                }
                return true;
            })
        );
    });

    // Property 8: Summary structure validity
    test('Property 8: Summary structure validity', () => {
        fc.assert(
            fc.property(summaryGen, (summary) => {
                const severitiesValid = Object.values(summary.bySeverity).every(c => c >= 0);
                const qualityValid = Object.values(QualityLevel).includes(summary.overallQuality);
                return severitiesValid && qualityValid;
            })
        );
    });

});
