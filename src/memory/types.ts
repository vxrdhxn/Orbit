export interface DecisionRecord {
    id: string;
    timestamp: number;
    project_id: string;
    file_path: string;
    change_type: string;
    what: string;
    why: string;
    improvements: string;
    tradeoffs: string;
    production: string;
    approved: boolean;
}

export interface DecisionQuery {
    project_id?: string;
    file_path?: string;
    change_type?: string;
    startDate?: number;
    endDate?: number;
    limit?: number;
    offset?: number;
}
