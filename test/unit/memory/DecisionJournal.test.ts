import fs from 'fs';
import path from 'path';
import fc from 'fast-check';
import { SQLiteMemory } from '../../../src/memory/SQLiteMemory';
import { DecisionJournal } from '../../../src/memory/DecisionJournal';
import { StructuredResponse } from '../../../src/reasoning/types';

describe('DecisionJournal', () => {
    let memory: SQLiteMemory;
    let journal: DecisionJournal;
    const testWorkspace = path.join(__dirname, 'test-workspace-journal');
    const dbDir = path.join(testWorkspace, '.orbit');
    const dbPath = path.join(dbDir, 'decisions.db');

    beforeEach(() => {
        if (!fs.existsSync(testWorkspace)) {
            fs.mkdirSync(testWorkspace, { recursive: true });
        }
        memory = new SQLiteMemory(testWorkspace);
        memory.initialize();
        journal = new DecisionJournal(memory);
    });

    afterEach(() => {
        memory.close();
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
        if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
    });

    afterAll(() => {
        if (fs.existsSync(testWorkspace)) {
            fs.rmSync(testWorkspace, { recursive: true, force: true });
        }
    });

    test('Property 10: Decision Persistence Round-Trip', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1 }), // projectId
                fc.string({ minLength: 1 }), // filePath
                fc.string({ minLength: 1 }), // changeType
                fc.array(fc.string({ minLength: 1 }), { minLength: 1 }), // what
                fc.string(), // why
                fc.string(), // improvements
                fc.string(), // tradeoffs
                fc.string(), // production
                fc.boolean(), // approved
                (projectId, filePath, changeType, what, why, improvements, tradeoffs, production, approved) => {
                    const response: StructuredResponse = {
                        what,
                        why,
                        improvements,
                        tradeoffs,
                        production
                    };

                    const saved = journal.saveDecision(projectId, filePath, changeType, response, approved);
                    expect(saved).not.toBeNull();
                    if (!saved) return;

                    const queryFilter = { project_id: projectId };
                    const retrieved = journal.queryDecisions(queryFilter);

                    const found = retrieved.find(r => r.id === saved.id);
                    expect(found).not.toBeUndefined();
                    if (!found) return;

                    expect(found.project_id).toBe(projectId);
                    expect(found.file_path).toBe(filePath);
                    expect(found.change_type).toBe(changeType);
                    expect(found.what).toEqual(what); // Ensure what is retrieved correctly as array
                    expect(found.why).toBe(why);
                    expect(found.approved).toBe(approved);
                }
            )
        );
    });

    test('Property 11: Decision Query Filtering', () => {
        const dummyResponse: StructuredResponse = {
            what: ['do something'],
            why: 'because',
            improvements: '',
            tradeoffs: '',
            production: ''
        };

        const projA = 'project-a';
        const fileA = '/src/file-a.ts';
        const fileB = '/src/file-b.ts';
        const projB = 'project-b';

        journal.saveDecision(projA, fileA, 'refactor', dummyResponse, true);
        journal.saveDecision(projA, fileB, 'bugfix', dummyResponse, true);
        journal.saveDecision(projB, fileA, 'feature', dummyResponse, true);

        // Test filtering by project
        const fromProjA = journal.queryDecisions({ project_id: projA });
        expect(fromProjA.length).toBe(2);
        expect(fromProjA.every(d => d.project_id === projA)).toBe(true);

        // Test filtering by file
        const forFileA = journal.getDecisionsForFile(projA, fileA);
        expect(forFileA.length).toBe(1);
        expect(forFileA[0].file_path).toBe(fileA);
        expect(forFileA[0].project_id).toBe(projA);

        // Test recent decisions
        const recent = journal.getRecentDecisions(projB, 10);
        expect(recent.length).toBe(1);
        expect(recent[0].project_id).toBe(projB);
    });
});
