import { SQLiteMemory } from './SQLiteMemory';
import { DecisionRecord, DecisionQuery } from './types';
import { StructuredResponse } from '../reasoning/types';
import * as crypto from 'crypto';

// Polyfill randomUUID for strict test environments without Node 18 globals
const safeRandomUUID = () => {
    if (crypto && (crypto as any).randomUUID) {return (crypto as any).randomUUID();}
    return crypto.randomBytes(16).toString('hex');
};
export class DecisionJournal {
    private db: SQLiteMemory;

    constructor(db: SQLiteMemory) {
        this.db = db;
    }

    /**
     * Maps a StructuredResponse into a database-ready DecisionRecord and saves it.
     */
    public saveDecision(
        projectId: string,
        filePath: string,
        changeType: string,
        structuredResponse: StructuredResponse,
        approved: boolean = true
    ): DecisionRecord | null {
        // Generate unique IDs and timestamps (req 9.1)
        const record: DecisionRecord = {
            id: safeRandomUUID(),
            timestamp: Date.now(),
            project_id: projectId,
            file_path: filePath,
            change_type: changeType,
            // We join array data using a specific delimiter if needed, or JSON stringify to avoid DB schema mess
            what: JSON.stringify(structuredResponse.what),
            why: structuredResponse.why || '',
            improvements: structuredResponse.improvements || '',
            tradeoffs: structuredResponse.tradeoffs || '',
            production: structuredResponse.production || '',
            approved
        };

        const success = this.db.insert(record);
        return success ? record : null;
    }

    /**
     * Records a manual or system-generated decision without needing a full StructuredResponse.
     */
    public recordManualDecision(record: Partial<DecisionRecord> & { project_id: string, file_path: string }): DecisionRecord | null {
        const fullRecord: DecisionRecord = {
            id: record.id || safeRandomUUID(),
            timestamp: record.timestamp || Date.now(),
            project_id: record.project_id,
            file_path: record.file_path,
            change_type: record.change_type || 'implementation',
            what: Array.isArray(record.what) ? JSON.stringify(record.what) : (record.what || '[]'),
            why: record.why || '',
            improvements: record.improvements || '',
            tradeoffs: record.tradeoffs || '',
            production: record.production || '',
            approved: record.approved !== undefined ? record.approved : true
        };

        const success = this.db.insert(fullRecord);
        return success ? fullRecord : null;
    }

    /**
     * Direct query wrapper, automatically parsing JSON properties.
     */
    public queryDecisions(filter: DecisionQuery): DecisionRecord[] {
        const rawRecords = this.db.query(filter);
        return rawRecords.map(this.parseRecord);
    }

    /**
     * Gets the most recent decisions.
     */
    public getRecentDecisions(projectId: string, limit: number = 20, offset: number = 0): DecisionRecord[] {
        return this.queryDecisions({ project_id: projectId, limit, offset });
    }

    /**
     * Gets history for a specific file.
     */
    public getDecisionsForFile(projectId: string, filePath: string, limit: number = 20, offset: number = 0): DecisionRecord[] {
        return this.queryDecisions({ project_id: projectId, file_path: filePath, limit, offset });
    }

    /**
     * Exports all decisions for a given project to a JSON-serializable array.
     */
    public exportDecisions(projectId: string): DecisionRecord[] {
        return this.queryDecisions({ project_id: projectId });
    }

    /**
     * Imports a list of decisions, upserting them into the database.
     * Returns the number of successfully imported decisions.
     */
    public importDecisions(records: any[]): number {
        let count = 0;
        for (const record of records) {
            if (this.db.upsert(record)) {
                count++;
            }
        }
        return count;
    }

    /**
     * Parses the stringified arrays back into arrays safely.
     */
    private parseRecord(record: any): DecisionRecord {
        let whatArray: string[] = [];
        try {
            whatArray = JSON.parse(record.what);
        } catch (e) {
            whatArray = [record.what];
        }

        return {
            ...record,
            what: whatArray
        };
    }
}
