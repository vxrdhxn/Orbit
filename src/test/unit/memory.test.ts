import * as fs from 'fs';
import * as path from 'path';
import * as fc from 'fast-check';
import { SQLiteMemory } from '../../memory/SQLiteMemory';
import { DecisionJournal } from '../../memory/DecisionJournal';
import { StructuredResponse } from '../../reasoning/types';

describe('SQLite Memory and Decision Journal', () => {
    let memory: SQLiteMemory;
    let journal: DecisionJournal;
    const testWorkspace = path.join(__dirname, 'test-workspace-memory');

    beforeAll(() => {
        // Create a temporary workspace for sqlite testing
        if (!fs.existsSync(testWorkspace)) {
            fs.mkdirSync(testWorkspace, { recursive: true });
        }
    });

    beforeEach(() => {
        // Clear previous test data out if persistent
        const dbPath = path.join(testWorkspace, '.orbit', 'decisions.db');
        try {
            if (fs.existsSync(dbPath)) {fs.unlinkSync(dbPath);}
        } catch (e) {
            console.warn('Could not unlink test database:', e);
        }

        // Initialize fresh DB
        memory = new SQLiteMemory(testWorkspace);
        memory.initialize();
        journal = new DecisionJournal(memory);
    });

    afterEach(() => {
        memory.close();
    });

    afterAll(() => {
        // Cleanup workspace
        try {
            fs.rmSync(testWorkspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        } catch (e) {
            console.warn('Could not completely remove test workspace:', e);
        }
    });

    // Property 25: Database Schema Integrity is inherently tested via initialisation success
    test('Database Schema Integrity creates required tables', () => {
        // We know it created because we can query it without SQL errors.
        const res = memory.query({ limit: 1 });
        expect(res).toBeDefined();
    });

    // Property 26: Migration Idempotence
    test('Property 26: Database Migration Idempotence', () => {
        // Calling initialize multiple times runs migrate
        expect(() => {
            memory.initialize();
            memory.initialize();
            memory.initialize();
        }).not.toThrow();
    });

    // Property 27: Database Write Validation
    test('Property 27: Database Write Validation prevents bad data', () => {
        fc.assert(
            fc.property(
                fc.string(), fc.string(), fc.string(),
                (badId, projectId, filePath) => {
                    // Purposefully missing 'change_type'
                    const record: any = {
                        id: badId || '123',
                        timestamp: Date.now(),
                        project_id: projectId || 'proj',
                        file_path: filePath || 'file',
                        // change_type missing
                        what: '[]',
                        why: '...',
                        improvements: '',
                        tradeoffs: '',
                        production: '',
                        approved: true
                    };

                    const success = memory.insert(record);
                    expect(success).toBe(false);
                }
            )
        );
    });

    // Property 10: Decision Persistence Round-Trip
    test('Property 10: Decision Persistence Round-Trip', () => {
        const projId = 'proj-roundtrip';
        fc.assert(
            fc.property(
                fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), fc.boolean(),
                (filePath, whyReason, approvedStatus) => {
                    const response: StructuredResponse = {
                        what: ['Changed something'],
                        why: whyReason,
                        improvements: 'None',
                        tradeoffs: 'None',
                        production: 'None'
                    };

                    const saved = journal.saveDecision(projId, filePath, 'edit', response, approvedStatus);
                    expect(saved).not.toBeNull();

                    // Query it back specifically by the uniquely generated ID
                    const results = journal.queryDecisions({ project_id: projId, file_path: filePath });
                    const roundtrip = results.find(r => r.id === saved!.id);

                    expect(roundtrip).toBeDefined();
                    expect(roundtrip?.why).toBe(whyReason);
                    expect(roundtrip?.approved).toBe(approvedStatus);
                    expect(roundtrip?.what).toEqual(['Changed something']);
                }
            ),
            { numRuns: 10 } // Limited runs for DB I/O speed overhead
        );
    });

    // Property 11: Query filtering
    test('Property 11: Decision Query Filtering works by file', () => {
        const response: StructuredResponse = {
            what: [], why: '...', improvements: '', tradeoffs: '', production: ''
        };

        journal.saveDecision('proj-1', 'a.ts', 'edit', response);
        journal.saveDecision('proj-1', 'b.ts', 'edit', response);
        journal.saveDecision('proj-1', 'a.ts', 'review', response);

        const aResults = journal.getDecisionsForFile('proj-1', 'a.ts');
        expect(aResults.length).toBe(2);

        const bResults = journal.getDecisionsForFile('proj-1', 'b.ts');
        expect(bResults.length).toBe(1);
    });

    // Property 29: Graceful Database Error Handling
    test('Property 29: Graceful Database Error Handling', () => {
        memory.close();

        // System shouldn't crash if db is closed or fails
        expect(() => {
            const success = memory.insert({} as any);
            expect(success).toBe(false);

            const result = memory.query({});
            expect(result).toEqual([]);
        }).not.toThrow();
    });
});
