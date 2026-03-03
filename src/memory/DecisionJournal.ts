import { SQLiteMemory } from './SQLiteMemory';
import { DecisionRecord, DecisionQuery } from './types';
import { StructuredResponse } from '../reasoning/types';
import * as crypto from 'crypto';

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
            id: crypto.randomUUID(),
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
     * Direct query wrapper, automatically parsing JSON properties.
     */
    public queryDecisions(filter: DecisionQuery): DecisionRecord[] {
        const rawRecords = this.db.query(filter);
        return rawRecords.map(this.parseRecord);
    }

    /**
     * Gets the most recent decisions.
     */
    public getRecentDecisions(projectId: string, limit: number = 10): DecisionRecord[] {
        return this.queryDecisions({ project_id: projectId, limit });
    }

    /**
     * Gets history for a specific file.
     */
    public getDecisionsForFile(projectId: string, filePath: string, limit: number = 10): DecisionRecord[] {
        return this.queryDecisions({ project_id: projectId, file_path: filePath, limit });
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
