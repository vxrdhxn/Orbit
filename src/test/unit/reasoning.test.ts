import * as fc from 'fast-check';
import { ResponseFormatter } from '../../reasoning/ResponseFormatter';
import { LLMRouter } from '../../reasoning/LLMRouter';
import { StructuredResponse } from '../../reasoning/types';

describe('ResponseFormatter', () => {
    let formatter: ResponseFormatter;

    beforeEach(() => {
        formatter = new ResponseFormatter();
    });

    test('Validates a correctly structured response', () => {
        const validResponse: StructuredResponse = {
            what: ['Changed variable name', 'Refactored function'],
            why: 'To improve code readability and maintainability.',
            improvements: 'Could further extract into a separate class.',
            tradeoffs: 'Slightly higher memory usage.',
            production: 'Ensure tests pass before deploying.'
        };

        const result = formatter.validate(validResponse);
        expect(result.isValid).toBe(true);
        expect(result.missingSections.length).toBe(0);
        expect(result.errors.length).toBe(0);
    });

    test('Identifies missing sections', () => {
        const invalidResponse: Partial<StructuredResponse> = {
            what: ['Did some things'],
            why: 'Because.' // Too short
        };

        const result = formatter.validate(invalidResponse);
        expect(result.isValid).toBe(false);
        expect(result.missingSections).toContain('why'); // Due to length
        expect(result.missingSections).toContain('improvements');
        expect(result.missingSections).toContain('tradeoffs');
        expect(result.missingSections).toContain('production');
    });

    // Property 1: Response Validation Completeness
    test('Property 1: Response Validation Completeness checks all missing sections', () => {
        fc.assert(
            fc.property(
                fc.record({
                    what: fc.option(fc.array(fc.string({ minLength: 10 }), { minLength: 1 })),
                    why: fc.option(fc.string({ minLength: 10 })),
                    improvements: fc.option(fc.string({ minLength: 10 })),
                    tradeoffs: fc.option(fc.string({ minLength: 10 })),
                    production: fc.option(fc.string({ minLength: 10 }))
                }),
                (response) => {
                    const result = formatter.validate(response as any);

                    ['what', 'why', 'improvements', 'tradeoffs', 'production'].forEach(section => {
                        const hasValidSection = response[section as keyof typeof response] !== null;
                        if (!hasValidSection) {
                            expect(result.missingSections).toContain(section);
                        }
                    });
                }
            )
        );
    });

    // Property 16: Markdown Rendering Preserves Code Blocks
    test('Property 16: Markdown Rendering Preserves Code Blocks', () => {
        const response: StructuredResponse = {
            what: ['Updates'],
            why: 'Using ```javascript\nconst x = 1;\n``` for setup',
            improvements: 'None',
            tradeoffs: 'None',
            production: 'None'
        };

        const markdown = formatter.renderMarkdown(response);
        expect(markdown).toContain('```javascript\nconst x = 1;\n```');
    });
});

describe('LLMRouter', () => {
    let formatter: ResponseFormatter;
    let router: LLMRouter;

    beforeEach(() => {
        formatter = new ResponseFormatter();
        router = new LLMRouter(formatter, { maxRetries: 2, enforceFormat: true });
    });

    test('Transforms a fully structured valid raw string', () => {
        const rawString = `
### What changed
- Added tests
- Fixed bugs

### Why
Because it was requested by the user.

### Improvements
More tests could be written.

### Tradeoffs
Extra time spent on testing.

### Production Considerations
Deploy normally.
        `;

        const result = router.transformResponse(rawString);
        expect(result).not.toBeNull();
        expect(result?.what.length).toBe(2);
        expect(result?.why).toContain('requested');
        expect(result?.improvements).toContain('written');
        expect(result?.tradeoffs).toContain('testing');
        expect(result?.production).toContain('Deploy');
    });

    test('Falls back or fails on completely bad string (enforceFormat=true)', () => {
        const rawString = "I just changed some code.";
        const result = router.transformResponse(rawString);
        // With enforceFormat=true, heuristcs won't save a completely empty structure.
        expect(result).toBeNull();
    });

    // Property 2: LLM Output Transformation
    test('Property 2: LLM Output Transformation handles random strings safely', () => {
        fc.assert(
            fc.property(fc.string(), (rawString) => {
                const result = router.transformResponse(rawString);
                if (result) {
                    const validation = formatter.validate(result);
                    expect(validation.isValid).toBe(true);
                } else {
                    expect(result).toBeNull();
                }
            })
        );
    });
});
