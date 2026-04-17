import { EnhancedDiffEngine } from '../../../src/services/EnhancedDiffEngine';
import { LLMRouter } from '../../../src/reasoning/LLMRouter';
import { ResponseFormatter } from '../../../src/reasoning/ResponseFormatter';

describe('EnhancedDiffEngine', () => {
    let engine: EnhancedDiffEngine;
    let mockOllamaClient: any;
    let router: LLMRouter;

    beforeEach(() => {
        mockOllamaClient = {
            generate: jest.fn()
        };
        const formatter = new ResponseFormatter();
        router = new LLMRouter(formatter, { maxRetries: 0, enforceFormat: false });
        engine = new EnhancedDiffEngine(mockOllamaClient, router);
        jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should generate a valid proposal from structured LLM response', async () => {
        const mockResponse = `
\`\`\`diff
--- a/test.ts
+++ b/test.ts
@@ -1,1 +1,2 @@
-code
+code-safe
+console.log('safe');
\`\`\`

### What changed
- Added comprehensive error handling to the function
- Improved performance by reducing redundant calculations
### Why
Necessary for safety and stability of the system under high load conditions.
### Improvements
Further optimizations could be applied to the data structure used for caching.
### Tradeoffs
Slightly increased memory usage due to more detailed error objects being allocated.
### Production Considerations
Ensure the deployment environment has sufficient memory to handle the overhead.
`.trim();

        mockOllamaClient.generate.mockResolvedValue(mockResponse);

        const proposal = await engine.generateProposal('test.ts', 'code', 'make it safe');

        expect(proposal).not.toBeNull();
        if (proposal) {
            expect(proposal.fileName).toBe('test.ts');
            expect(proposal.reasoning.what.join(' ')).toContain('Added comprehensive error handling');
            expect(proposal.hunks.length).toBe(1);
            expect(proposal.hunks[0].lines).toContain('+code-safe');
        }
    });

    it('should return null if reasoning cannot be parsed', async () => {
        mockOllamaClient.generate.mockResolvedValue('invalid response');
        const proposal = await engine.generateProposal('test.ts', 'code', 'make it safe');
        expect(proposal).toBeNull();
    });

    it('should return null if diff cannot be extracted', async () => {
        const mockResponse = `### What changed
- test
### Why
test
### Improvements
test
### Tradeoffs
test
### Production Considerations
test
`.trim();
        mockOllamaClient.generate.mockResolvedValue(mockResponse);
        const proposal = await engine.generateProposal('test.ts', 'code', 'make it safe');
        expect(proposal).toBeNull();
    });
});
