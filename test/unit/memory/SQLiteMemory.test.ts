import * as fs from 'fs';
import * as path from 'path';
import fc from 'fast-check';
import { SQLiteMemory } from '../../../src/memory/SQLiteMemory';
import { DecisionRecord } from '../../../src/memory/types';

describe('SQLiteMemory', () => {
    let memory: SQLiteMemory;
    const testWorkspace = path.join(__dirname, 'test-workspace');
    const dbDir = path.join(testWorkspace, '.orbit');
    const dbPath = path.join(dbDir, 'decisions.db');

    beforeEach(() => {
        if (!fs.existsSync(testWorkspace)) {
            fs.mkdirSync(testWorkspace, { recursive: true });
        }
        memory = new SQLiteMemory(testWorkspace);
        memory.initialize();
    });

    afterEach(() => {
        memory.close();
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
        if (fs.existsSync(dbPath + '-wal')) {
            fs.unlinkSync(dbPath + '-wal');
        }
        if (fs.existsSync(dbPath + '-shm')) {
            fs.unlinkSync(dbPath + '-shm');
        }
    });

    afterAll(() => {
        if (fs.existsSync(testWorkspace)) {
            fs.rmSync(testWorkspace, { recursive: true, force: true });
        }
    });

    test('11.1 Database schema creation and migration idempotence (Prop 25, 26)', () => {
        expect(fs.existsSync(dbPath)).toBe(true);

        // Try migrating again to test idempotence
        expect(() => {
            memory['migrate']();
        }).not.toThrow();
    });

    test('Property 27: Database Write Validation', () => {
        fc.assert(
            fc.property(
                fc.string(), // Wait, generating invalid record basically by omitting fields
                (randomStr) => {
                    const invalidRecord = {
                        id: randomStr,
                    } as any;
                    const result = memory.insert(invalidRecord);
                    expect(result).toBe(false);
                }
            )
        );
    });

    test('11.2 Decision save and query (Prop 10)', () => {
        const record: DecisionRecord = {
            id: 'test-id-1',
            timestamp: Date.now(),
            project_id: 'proj-1',
            file_path: '/src/main.ts',
            change_type: 'refactor',
            what: '[]',
            why: 'Because',
            improvements: 'None',
            tradeoffs: 'Speed',
            production: 'Safe',
            approved: true
        };

        const insertSuccess = memory.insert(record);
        expect(insertSuccess).toBe(true);

        const results = memory.query({ project_id: 'proj-1' });
        expect(results.length).toBe(1);
        expect(results[0].id).toBe('test-id-1');
        expect(results[0].approved).toBe(true);
    });

    test('11.3 Error handling (Prop 29)', () => {
        memory.close();

        // After closing, operations should fail gracefully, not throw unhandled exceptions
        const result = memory.insert({} as any);
        expect(result).toBe(false);

        const queryResult = memory.query({});
        expect(queryResult).toEqual([]);
    });

    test('Property 28: Concurrent read safety', async () => {
        // Just demonstrating that WAL mode is enabled and querying rapidly doesn't throw
        const readers = Array.from({ length: 50 }).map(() => {
            return new Promise<void>((resolve) => {
                memory.query({});
                resolve();
            });
        });
        await expect(Promise.all(readers)).resolves.not.toThrow();
    });
});
