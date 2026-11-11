import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { DecisionJournal } from './DecisionJournal';
import { log } from '../logger';

/** Branch that holds the shared journal. It never touches the user's own branches. */
export const JOURNAL_BRANCH = 'orbit-journal';
const JOURNAL_FILE = 'journal.jsonl';
/** A sync lock older than this is assumed to be left over from a crashed window. */
const STALE_LOCK_MS = 2 * 60 * 1000;

export type GitRunner = (args: string[], input?: string) => Promise<string>;

/** Runs git with an argument list (no shell), optionally writing `input` to stdin. */
export function createGitRunner(cwd: string): GitRunner {
    return (args, input) => new Promise((resolve, reject) => {
        const child = spawn('git', args, { cwd, windowsHide: true });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', d => { stdout += d; });
        child.stderr.on('data', d => { stderr += d; });
        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(stderr.trim() || `git ${args[0]} exited with code ${code}`));
            }
        });
        child.stdin.end(input ?? '');
    });
}

/**
 * Parses a JSON Lines journal. Bad lines are skipped and counted instead of
 * aborting the whole import.
 */
export function parseJournalLines(content: string): { records: any[]; skipped: number } {
    const records: any[] = [];
    let skipped = 0;
    for (const line of content.split(/\r?\n/)) {
        if (!line.trim()) {
            continue;
        }
        try {
            const record = JSON.parse(line);
            if (record && typeof record === 'object' && record.id) {
                records.push(record);
            } else {
                skipped++;
            }
        } catch {
            skipped++;
        }
    }
    return { records, skipped };
}

/**
 * Shares the Decision Journal with a team.
 *
 * - 'file' method: writes `.orbit/journal.jsonl` in the workspace.
 * - 'git' method: keeps the journal on a dedicated `orbit-journal` branch. Commits
 *   are built with git plumbing (hash-object, mktree, commit-tree, update-ref), so the
 *   user's checkout, index, current branch and uncommitted work are never touched.
 *   Records are merged as a union by id, so there are no merge conflicts; if someone
 *   else pushed in between, the sync fetches, merges and retries.
 *
 * A lock file keeps two VS Code windows from syncing the same workspace at once.
 */
export class GitJournalSyncService {
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private readonly git: GitRunner;

    constructor(
        private journal: DecisionJournal,
        private workspaceRoot: string,
        git?: GitRunner
    ) {
        this.git = git ?? createGitRunner(workspaceRoot);
    }

    private get orbitDir(): string {
        return path.join(this.workspaceRoot, '.orbit');
    }

    private get syncFilePath(): string {
        return path.join(this.orbitDir, JOURNAL_FILE);
    }

    public activate(subscriptions: { dispose(): any }[]) {
        const config = vscode.workspace.getConfiguration('orbit');

        if (config.get<string>('sync.method') === 'git' || config.get<boolean>('sync.enableWorkspaceSync', false)) {
            fs.mkdirSync(this.orbitDir, { recursive: true });
            const watchPattern = new vscode.RelativePattern(this.orbitDir, JOURNAL_FILE);
            this.fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern);
            this.fileWatcher.onDidChange(() => this.importFromWorkspace(this.syncFilePath));
            this.fileWatcher.onDidCreate(() => this.importFromWorkspace(this.syncFilePath));
            subscriptions.push(this.fileWatcher);
        }

        subscriptions.push(
            vscode.commands.registerCommand('orbit.sync.export', () => this.exportAndSync()),
            vscode.commands.registerCommand('orbit.sync.import', () => this.importFromWorkspace(this.syncFilePath, true))
        );
    }

    public async exportAndSync(): Promise<void> {
        const release = this.acquireLock();
        if (!release) {
            vscode.window.showInformationMessage('Orbit: A journal sync is already running in another window.');
            return;
        }

        try {
            const method = vscode.workspace.getConfiguration('orbit').get<string>('sync.method');
            if (method === 'git') {
                const count = await this.syncWithGit();
                vscode.window.showInformationMessage(`Orbit: Synced ${count} decisions via the '${JOURNAL_BRANCH}' branch.`);
            } else {
                const count = this.writeWorkspaceFile();
                vscode.window.showInformationMessage(`Orbit: Exported ${count} decisions to .orbit/${JOURNAL_FILE}`);
            }
        } catch (error: any) {
            log(`Journal sync failed: ${error?.message ?? error}`);
            vscode.window.showErrorMessage(`Orbit: Journal sync failed: ${error?.message ?? error}`);
        } finally {
            release();
        }
    }

    /**
     * Merges the remote journal into the local one and publishes the union.
     * @returns the number of decisions in the published journal.
     */
    public async syncWithGit(maxAttempts = 3): Promise<number> {
        await this.git(['rev-parse', '--git-dir']);
        const hasRemote = (await this.git(['remote'])).split(/\s+/).includes('origin');

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            let parent: string | null = null;

            if (hasRemote) {
                try {
                    await this.git(['fetch', 'origin', `+refs/heads/${JOURNAL_BRANCH}:refs/remotes/origin/${JOURNAL_BRANCH}`]);
                } catch {
                    // The branch does not exist on the remote yet; it is created by the push below.
                }
            }
            parent = await this.resolveRef(hasRemote ? `refs/remotes/origin/${JOURNAL_BRANCH}` : `refs/heads/${JOURNAL_BRANCH}`)
                ?? await this.resolveRef(`refs/heads/${JOURNAL_BRANCH}`);

            if (parent) {
                const remoteContent = await this.git(['show', `${parent}:${JOURNAL_FILE}`]).catch(() => '');
                this.importRecords(remoteContent, `${JOURNAL_BRANCH} branch`);
            }

            const content = this.serializeJournal();
            const commit = await this.commitJournal(content, parent);
            await this.git(['update-ref', `refs/heads/${JOURNAL_BRANCH}`, commit]);

            if (!hasRemote) {
                return this.countLines(content);
            }
            try {
                await this.git(['push', 'origin', `refs/heads/${JOURNAL_BRANCH}:refs/heads/${JOURNAL_BRANCH}`]);
                return this.countLines(content);
            } catch (error: any) {
                // Someone pushed first: fetch their records, merge and try again.
                log(`Journal push rejected (attempt ${attempt}): ${error?.message ?? error}`);
                if (attempt === maxAttempts) {
                    throw new Error(`could not push the '${JOURNAL_BRANCH}' branch: ${error?.message ?? error}`);
                }
            }
        }
        return 0;
    }

    private async resolveRef(ref: string): Promise<string | null> {
        try {
            return (await this.git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])).trim() || null;
        } catch {
            return null;
        }
    }

    /** Builds a commit holding only the journal file, without using the index or working tree. */
    private async commitJournal(content: string, parent: string | null): Promise<string> {
        const blob = (await this.git(['hash-object', '-w', '--stdin'], content)).trim();
        const tree = (await this.git(['mktree'], `100644 blob ${blob}\t${JOURNAL_FILE}\n`)).trim();
        const args = ['commit-tree', tree, '-m', 'Orbit: update team decision journal'];
        if (parent) {
            args.splice(2, 0, '-p', parent);
        }
        return (await this.git(args)).trim();
    }

    private serializeJournal(): string {
        const projectId = vscode.workspace.name || 'default';
        const decisions = this.journal.exportDecisions(projectId).sort((a, b) => a.timestamp - b.timestamp);
        return decisions.map(d => JSON.stringify(d)).join('\n') + (decisions.length ? '\n' : '');
    }

    private countLines(content: string): number {
        return content.split('\n').filter(l => l.trim()).length;
    }

    private writeWorkspaceFile(): number {
        fs.mkdirSync(this.orbitDir, { recursive: true });
        const content = this.serializeJournal();
        fs.writeFileSync(this.syncFilePath, content, 'utf8');
        return this.countLines(content);
    }

    private importRecords(content: string, source: string): number {
        const { records, skipped } = parseJournalLines(content);
        if (skipped > 0) {
            log(`Skipped ${skipped} malformed line(s) in the journal from ${source}.`);
            vscode.window.showWarningMessage(`Orbit: Skipped ${skipped} malformed journal line(s) from ${source}.`);
        }
        return records.length ? this.journal.importDecisions(records) : 0;
    }

    public importFromWorkspace(syncFilePath: string, manual: boolean = false) {
        try {
            let importedCount = 0;
            let found = false;

            // Older versions wrote a single JSON array to journal.json.
            const legacyPath = syncFilePath.replace(/\.jsonl$/, '.json');
            if (fs.existsSync(legacyPath)) {
                found = true;
                try {
                    const records = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
                    if (Array.isArray(records)) {
                        importedCount += this.journal.importDecisions(records);
                    }
                } catch (e: any) {
                    log(`Could not read legacy journal.json: ${e?.message ?? e}`);
                }
            }

            if (fs.existsSync(syncFilePath)) {
                found = true;
                importedCount += this.importRecords(fs.readFileSync(syncFilePath, 'utf8'), `.orbit/${JOURNAL_FILE}`);
            }

            if (manual) {
                vscode.window.showInformationMessage(found
                    ? `Orbit: Imported ${importedCount} decisions from the workspace journal.`
                    : 'Orbit: No journal found in the workspace.');
            }
        } catch (error: any) {
            log(`Failed to import Orbit journal: ${error?.message ?? error}`);
            if (manual) {
                vscode.window.showErrorMessage('Orbit: Failed to import the workspace journal.');
            }
        }
    }

    /**
     * Takes a lock shared by every VS Code window on this workspace.
     * @returns a release function, or null if another sync holds the lock.
     */
    public acquireLock(): (() => void) | null {
        fs.mkdirSync(this.orbitDir, { recursive: true });
        const lockPath = path.join(this.orbitDir, 'sync.lock');

        const tryCreate = (): boolean => {
            try {
                fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
                return true;
            } catch {
                return false;
            }
        };

        if (!tryCreate()) {
            try {
                const age = Date.now() - fs.statSync(lockPath).mtimeMs;
                if (age < STALE_LOCK_MS) {
                    return null;
                }
                fs.unlinkSync(lockPath);
            } catch {
                // The other window just released it.
            }
            if (!tryCreate()) {
                return null;
            }
        }

        return () => {
            try {
                fs.unlinkSync(lockPath);
            } catch {
                // Already removed.
            }
        };
    }
}
