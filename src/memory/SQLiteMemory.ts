import * as fs from 'fs';
import * as path from 'path';
import { DecisionRecord, DecisionQuery } from './types';
import { log } from '../logger';

/**
 * The parts of Node's built-in `node:sqlite` that Orbit uses. It ships with the
 * Node inside VS Code (1.101+), so there is no native module to compile and no
 * Electron ABI mismatch (better-sqlite3 failed to load inside VS Code).
 */
interface SqliteStatement {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
}

interface SqliteDatabase {
    exec(sql: string): void;
    prepare(sql: string): SqliteStatement;
    close(): void;
}

function openDatabase(filePath: string): SqliteDatabase {
    // Loaded at runtime so that a host without node:sqlite fails here, inside the
    // try/catch in initialize(), instead of when the extension loads.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite');
    return new DatabaseSync(filePath) as SqliteDatabase;
}

export class SQLiteMemory {
    private db: SqliteDatabase | null = null;
    private dbPath: string;

    constructor(workspaceRoot: string) {
        // As per req 14.1, database file in workspace .orbit/decisions.db
        const orbitDir = path.join(workspaceRoot, '.orbit');
        if (!fs.existsSync(orbitDir)) {
            fs.mkdirSync(orbitDir, { recursive: true });
        }
        this.dbPath = path.join(orbitDir, 'decisions.db');
        // Ensure the file exists before chmod; SQLite would otherwise create it later
        if (!fs.existsSync(this.dbPath)) {
            fs.writeFileSync(this.dbPath, '');
        }
        try {
            fs.chmodSync(this.dbPath, 0o600);
        } catch (e) {
            console.warn('Could not set restrictive permissions on database file:', e);
        }
    }

    /**
     * Initializes the database connection and runs migrations.
     */
    public initialize(): void {
        try {
            this.db = openDatabase(this.dbPath);
            // Requirement 14.6: enable concurrent reads via WAL mode
            this.db.exec('PRAGMA journal_mode = WAL');
            this.migrate();
        } catch (error: any) {
            // Requirement 15.2: Graceful database error handling. Say so in the Orbit
            // output channel: a silent failure here hid a broken Decision Journal before.
            log(`Decision Journal disabled: could not open ${this.dbPath}: ${error?.message ?? error}`);
            console.error(`Failed to initialize SQLite Memory at ${this.dbPath}:`, error);
            this.db = null;
        }
    }

    /**
     * Idempotent migration system for database schema.
     */
    private migrate(): void {
        if (!this.db) {return;}

        // Ensure schema_version table exists
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at INTEGER NOT NULL
            )
        `);

        const getVersion = this.db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number | null };
        const currentVersion = getVersion?.version || 0;

        const migrations = [
            {
                version: 1,
                up: (db: SqliteDatabase) => {
                    // Requirements 14.2 & 14.3: Create decisions table and indexes
                    db.exec(`
                        CREATE TABLE IF NOT EXISTS decisions (
                            id TEXT PRIMARY KEY,
                            timestamp INTEGER NOT NULL,
                            project_id TEXT NOT NULL,
                            file_path TEXT NOT NULL,
                            change_type TEXT NOT NULL,
                            what TEXT NOT NULL,
                            why TEXT NOT NULL,
                            improvements TEXT NOT NULL,
                            tradeoffs TEXT NOT NULL,
                            production TEXT NOT NULL,
                            approved INTEGER NOT NULL
                        )
                    `);

                    db.exec(`CREATE INDEX IF NOT EXISTS idx_decisions_project_id ON decisions(project_id)`);
                    db.exec(`CREATE INDEX IF NOT EXISTS idx_decisions_file_path ON decisions(file_path)`);
                    db.exec(`CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON decisions(timestamp)`);
                    db.exec(`CREATE INDEX IF NOT EXISTS idx_decisions_change_type ON decisions(change_type)`);
                }
            }
            // Add future migrations here
            // { version: 2, up: (db) => { db.exec('ALTER TABLE ...') } }
        ];

        // Apply pending migrations
        for (const migration of migrations) {
            if (currentVersion < migration.version) {
                try {
                    migration.up(this.db);
                    this.db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(migration.version, Date.now());
                } catch (err) {
                    console.error(`Migration v${migration.version} failed:`, err);
                    break;
                }
            }
        }
    }

    /**
     * Inserts a decision record.
     * Validates required fields before insertion.
     */
    public insert(record: DecisionRecord): boolean {
        if (!this.db) {return false;}

        // Validation (Requirement 14.5)
        if (!record.id || !record.project_id || !record.file_path || !record.change_type) {
            console.error('Invalid decision record: missing required fields');
            return false;
        }

        try {
            const stmt = this.db.prepare(`
                INSERT INTO decisions (
                    id, timestamp, project_id, file_path, change_type, 
                    what, why, improvements, tradeoffs, production, approved
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                record.id,
                record.timestamp,
                record.project_id,
                record.file_path,
                record.change_type,
                record.what, // Note: array was joined in DecisionJournal
                record.why,
                record.improvements,
                record.tradeoffs,
                record.production,
                record.approved ? 1 : 0
            );
            return true;
        } catch (error) {
            console.error('Failed to insert decision record:', error);
            return false;
        }
    }

    /**
     * Upserts a decision record (inserts or replaces based on primary key).
     */
    public upsert(record: any): boolean {
        if (!this.db) {return false;}

        if (!record.id || !record.project_id || !record.file_path || !record.change_type) {
            console.error('Invalid decision record for upsert: missing required fields');
            return false;
        }

        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO decisions (
                    id, timestamp, project_id, file_path, change_type, 
                    what, why, improvements, tradeoffs, production, approved
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                record.id,
                record.timestamp,
                record.project_id,
                record.file_path,
                record.change_type,
                Array.isArray(record.what) ? JSON.stringify(record.what) : (record.what || '[]'),
                record.why || '',
                record.improvements || '',
                record.tradeoffs || '',
                record.production || '',
                record.approved ? 1 : 0
            );
            return true;
        } catch (error) {
            console.error('Failed to upsert decision record:', error);
            return false;
        }
    }

    /**
     * Queries decision records with dynamic filtering.
     */
    public query(filter: DecisionQuery): DecisionRecord[] {
        if (!this.db) {return [];}

        try {
            let sql = 'SELECT * FROM decisions WHERE 1=1';
            const params: any[] = [];

            if (filter.project_id) {
                sql += ' AND project_id = ?';
                params.push(filter.project_id);
            }
            if (filter.file_path) {
                sql += ' AND file_path = ?';
                params.push(filter.file_path);
            }
            if (filter.change_type) {
                sql += ' AND change_type = ?';
                params.push(filter.change_type);
            }
            if (filter.startDate) {
                sql += ' AND timestamp >= ?';
                params.push(filter.startDate);
            }
            if (filter.endDate) {
                sql += ' AND timestamp <= ?';
                params.push(filter.endDate);
            }

            sql += ' ORDER BY timestamp DESC';

            if (filter.limit !== undefined) {
                sql += ' LIMIT ?';
                params.push(filter.limit);
            }

            if (filter.offset !== undefined) {
                sql += ' OFFSET ?';
                params.push(filter.offset);
            }

            const rows = this.db.prepare(sql).all(...params) as any[];

            // Map rows back to DecisionRecord
            return rows.map(row => ({
                id: row.id,
                timestamp: row.timestamp,
                project_id: row.project_id,
                file_path: row.file_path,
                change_type: row.change_type,
                what: row.what, // Will be split back to array by DecisionJournal
                why: row.why,
                improvements: row.improvements,
                tradeoffs: row.tradeoffs,
                production: row.production,
                approved: row.approved === 1
            }));
        } catch (error) {
            console.error('Failed to query decision records:', error);
            return [];
        }
    }

    /** True when the database opened successfully. */
    public get isAvailable(): boolean {
        return this.db !== null;
    }

    public close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
