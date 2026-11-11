import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { GitJournalSyncService, parseJournalLines, JOURNAL_BRANCH } from '../../../src/memory/GitJournalSyncService';

/** In-memory stand-in for DecisionJournal: records merged by id. */
function memoryJournal(initial: any[] = []) {
    const records = new Map<string, any>(initial.map(r => [r.id, r]));
    return {
        records,
        exportDecisions: () => [...records.values()],
        importDecisions: (list: any[]) => {
            list.forEach(r => records.set(r.id, r));
            return list.length;
        },
    };
}

const decision = (id: string, timestamp: number) => ({ id, timestamp, project_id: 'default', file_path: 'a.ts', change_type: 'fix', what: '[]' });

function git(cwd: string, ...args: string[]): string {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function makeClone(remote: string, dir: string): string {
    git(path.dirname(dir), 'clone', '-q', remote, dir);
    git(dir, 'config', 'user.email', 'test@example.com');
    git(dir, 'config', 'user.name', 'Test');
    return dir;
}

jest.setTimeout(60000);

describe('parseJournalLines', () => {
    it('skips malformed lines instead of failing the whole import', () => {
        const { records, skipped } = parseJournalLines('{"id":"a"}\nnot json\n{"no_id":1}\n\n{"id":"b"}\n');
        expect(records.map(r => r.id)).toEqual(['a', 'b']);
        expect(skipped).toBe(2);
    });
});

describe('GitJournalSyncService (real git)', () => {
    let tmp: string;
    let remote: string;

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-sync-'));
        remote = path.join(tmp, 'remote.git');
        git(tmp, 'init', '-q', '--bare', remote);
        // Seed the remote with a normal main branch, like a real project.
        const seed = makeClone(remote, path.join(tmp, 'seed'));
        fs.writeFileSync(path.join(seed, 'app.js'), 'console.log(1);\n');
        git(seed, 'add', '.');
        git(seed, 'commit', '-q', '-m', 'init');
        git(seed, 'push', '-q', 'origin', 'HEAD:main');
        git(remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    });

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('merges two teammates without touching their branches or uncommitted work', async () => {
        const alice = makeClone(remote, path.join(tmp, 'alice'));
        const bob = makeClone(remote, path.join(tmp, 'bob'));

        // Alice has uncommitted work on her branch while syncing.
        fs.writeFileSync(path.join(alice, 'app.js'), 'console.log("work in progress");\n');
        const aliceHead = git(alice, 'rev-parse', 'HEAD');
        const aliceBranch = git(alice, 'rev-parse', '--abbrev-ref', 'HEAD');

        const aliceJournal = memoryJournal([decision('a1', 1)]);
        await new GitJournalSyncService(aliceJournal as any, alice).syncWithGit();

        const bobJournal = memoryJournal([decision('b1', 2)]);
        await new GitJournalSyncService(bobJournal as any, bob).syncWithGit();

        // Bob received Alice's record, and the shared branch holds both.
        expect([...bobJournal.records.keys()].sort()).toEqual(['a1', 'b1']);
        const shared = git(remote, 'show', `${JOURNAL_BRANCH}:journal.jsonl`);
        expect(parseJournalLines(shared).records.map(r => r.id).sort()).toEqual(['a1', 'b1']);

        // Alice's checkout is exactly as she left it.
        expect(git(alice, 'rev-parse', 'HEAD')).toBe(aliceHead);
        expect(git(alice, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(aliceBranch);
        expect(fs.readFileSync(path.join(alice, 'app.js'), 'utf8')).toContain('work in progress');
        expect(git(alice, 'status', '--porcelain')).toBe('M app.js');
    });

    it('retries after a teammate pushed first', async () => {
        const alice = makeClone(remote, path.join(tmp, 'alice'));
        const bob = makeClone(remote, path.join(tmp, 'bob'));
        const aliceJournal = memoryJournal([decision('a1', 1)]);
        const bobJournal = memoryJournal([decision('b1', 2)]);

        // Bob pushes between Alice's fetch and her push.
        let raced = false;
        const realGit = (args: string[], input?: string) =>
            Promise.resolve(execFileSync('git', args, { cwd: alice, encoding: 'utf8', input: input ?? '' }));
        const racingGit = async (args: string[], input?: string) => {
            if (args[0] === 'push' && !raced) {
                raced = true;
                await new GitJournalSyncService(bobJournal as any, bob).syncWithGit();
            }
            return realGit(args, input);
        };

        await new GitJournalSyncService(aliceJournal as any, alice, racingGit).syncWithGit();

        const shared = git(remote, 'show', `${JOURNAL_BRANCH}:journal.jsonl`);
        expect(parseJournalLines(shared).records.map(r => r.id).sort()).toEqual(['a1', 'b1']);
    });

    it('lets only one window sync at a time', () => {
        const dir = path.join(tmp, 'ws');
        fs.mkdirSync(dir);
        const first = new GitJournalSyncService(memoryJournal() as any, dir);
        const second = new GitJournalSyncService(memoryJournal() as any, dir);

        const release = first.acquireLock();
        expect(release).not.toBeNull();
        expect(second.acquireLock()).toBeNull();
        release!();
        expect(second.acquireLock()).not.toBeNull();
    });
});
