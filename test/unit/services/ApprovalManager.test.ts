import * as fs from 'fs';
import { ApprovalManager } from '../../../src/services/ApprovalManager';
import { DiffProposal } from '../../../src/reasoning/types';

jest.mock('fs');

describe('ApprovalManager', () => {
    let manager: ApprovalManager;
    let mockJournal: any;
    let mockProposal: DiffProposal;

    beforeEach(() => {
        jest.clearAllMocks();
        mockJournal = {
            saveDecision: jest.fn().mockReturnValue(true)
        };
        manager = new ApprovalManager(mockJournal);

        mockProposal = {
            id: 'prop123',
            fileName: 'test.ts',
            fullDiff: '...',
            timestamp: Date.now(),
            reasoning: {
                what: ['change1'],
                why: 'because',
                improvements: 'none',
                tradeoffs: 'none',
                production: 'safe'
            },
            hunks: [
                { id: 'h1', oldStart: 1, oldLen: 1, newStart: 1, newLen: 1, header: '@@ -1,1 +1,1 @@', lines: ['-old', '+new'] }
            ]
        };
        manager.setProposal(mockProposal);

        (fs.readFileSync as jest.Mock).mockReturnValue('old');
        (fs.writeFileSync as jest.Mock).mockImplementation(() => { });
    });

    it('should apply selected hunks and log approval', async () => {
        const result = await manager.approve(['h1']);

        expect(result).toBe(true);
        expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), 'new');
        expect(mockJournal.saveDecision).toHaveBeenCalledWith(
            expect.any(String),
            'test.ts',
            'edit',
            mockProposal.reasoning,
            true
        );
    });

    it('should log rejection and not write to file', () => {
        manager.reject();

        expect(fs.writeFileSync).not.toHaveBeenCalled();
        expect(mockJournal.saveDecision).toHaveBeenCalledWith(
            expect.any(String),
            'test.ts',
            'edit',
            mockProposal.reasoning,
            false
        );
    });

    it('should handle partial approval', async () => {
        mockProposal.hunks = [
            { id: 'h1', oldStart: 1, oldLen: 1, newStart: 1, newLen: 1, header: 'H1', lines: ['-old', '+new1'] },
            { id: 'h2', oldStart: 2, oldLen: 1, newStart: 2, newLen: 1, header: 'H2', lines: ['-old2', '+new2'] }
        ];
        (fs.readFileSync as jest.Mock).mockReturnValue('old\nold2');

        const result = await manager.approve(['h1']);
        expect(result).toBe(true);
        // Should have applied h1 but not h2
        expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), 'new1\nold2');
    });

    it('should return false if no proposal set', async () => {
        const freshManager = new ApprovalManager(mockJournal);
        const result = await freshManager.approve(['h1']);
        expect(result).toBe(false);
    });
});
