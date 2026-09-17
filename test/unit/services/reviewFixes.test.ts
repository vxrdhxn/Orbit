import * as vscode from 'vscode';
import * as path from 'path';
import { FixApplicator } from '../../../src/reviewFixes';
import {
    Finding,
    FindingCategory,
    SeverityLevel,
} from '../../../src/reviewTypes';

describe('FixApplicator', () => {
    let applicator: FixApplicator;

    beforeEach(() => {
        applicator = new FixApplicator();
        jest.clearAllMocks();
    });

    function createFinding(
        overrides: Partial<Finding> = {}
    ): Finding {
        return {
            id: 'finding-1',
            category: FindingCategory.Bug,
            severity: SeverityLevel.Warning,
            title: 'Example bug',
            description: 'Example description',
            location: {
                fileName: '/mock/root/src/example.ts',
                startLine: 2,
                endLine: 2,
                snippet: 'const value = 1;',
            },
            suggestedFix: {
                description: 'Replace the incorrect value',
                code: 'const value = 2;',
            },
            ...overrides,
        };
    }

    function createDocument(content: string) {
        const lines = content.split('\n');

        return {
            lineCount: lines.length,
            lineAt: jest.fn((line: number) => ({
                text: lines[line],
            })),
            getText: jest.fn((range?: any) => {
                if (!range) {
                    return content;
                }

                const selectedLines = lines.slice(
                    range.startLine,
                    range.endLine + 1
                );

                return selectedLines.join('\n');
            }),
            save: jest.fn().mockResolvedValue(true),
        };
    }

    it('should apply a valid suggested fix', async () => {
        const document = createDocument(
            [
                'function test() {',
                'const value = 1;',
                'return value;',
                '}',
            ].join('\n')
        );

        (vscode.workspace.openTextDocument as jest.Mock)
            .mockResolvedValue(document);

        (vscode.workspace.applyEdit as jest.Mock)
            .mockResolvedValue(true);

        const finding = createFinding();

        const result = await applicator.applyFix(finding);

        expect(result).toBe(true);

        expect(vscode.workspace.openTextDocument)
            .toHaveBeenCalledWith(
                expect.objectContaining({
                    fsPath: path.resolve('/mock/root/src/example.ts'),
                })
            );

        expect(vscode.workspace.applyEdit)
            .toHaveBeenCalledTimes(1);

        expect(document.save).toHaveBeenCalledTimes(1);
    });

    it('should reject a stale finding when the snippet no longer matches', async () => {
        const document = createDocument(
            [
                'function test() {',
                'const value = 99;',
                'return value;',
                '}',
            ].join('\n')
        );

        (vscode.workspace.openTextDocument as jest.Mock)
            .mockResolvedValue(document);

        const finding = createFinding();

        const result = await applicator.applyFix(finding);

        expect(result).toBe(false);

        expect(vscode.workspace.applyEdit)
            .not.toHaveBeenCalled();

        expect(document.save)
            .not.toHaveBeenCalled();
    });

    it('should reject an invalid line range', async () => {
        const document = createDocument(
            [
                'function test() {',
                'const value = 1;',
                '}',
            ].join('\n')
        );

        (vscode.workspace.openTextDocument as jest.Mock)
            .mockResolvedValue(document);

        const finding = createFinding({
            location: {
                fileName: '/mock/root/src/example.ts',
                startLine: 0,
                endLine: 2,
                snippet: 'const value = 1;',
            },
        });

        const result = await applicator.applyFix(finding);

        expect(result).toBe(false);

        expect(vscode.workspace.applyEdit)
            .not.toHaveBeenCalled();
    });

    it('should reject a finding without a suggested fix', async () => {
        const finding = createFinding({
            suggestedFix: undefined,
        });

        const result = await applicator.applyFix(finding);

        expect(result).toBe(false);

        expect(vscode.workspace.openTextDocument)
            .not.toHaveBeenCalled();

        expect(vscode.workspace.applyEdit)
            .not.toHaveBeenCalled();
    });

    it('should reject when VS Code refuses the edit', async () => {
        const document = createDocument(
            [
                'function test() {',
                'const value = 1;',
                'return value;',
                '}',
            ].join('\n')
        );

        (vscode.workspace.openTextDocument as jest.Mock)
            .mockResolvedValue(document);

        (vscode.workspace.applyEdit as jest.Mock)
            .mockResolvedValue(false);

        const finding = createFinding();

        const result = await applicator.applyFix(finding);

        expect(result).toBe(false);

        expect(document.save)
            .not.toHaveBeenCalled();
    });
});