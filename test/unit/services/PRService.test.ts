import { PRService } from '../../../src/services/PRService';
import { execFile } from 'child_process';

jest.mock('child_process', () => ({
    execFile: jest.fn()
}));

jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn(() => ({
            get: jest.fn((key: string, defaultValue: unknown) => {
                if (key === 'prIntegration.enabled') {
                    return true;
                }

                return defaultValue;
            })
        }))
    }
}));

const mockedExecFile = execFile as unknown as jest.Mock;

describe('PRService', () => {
    let service: PRService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new PRService('/mock/workspace');
    });

    it('should reject empty comments', async () => {
        const result = await service.postReviewComment('   ');

        expect(result).toBe(false);
        expect(mockedExecFile).not.toHaveBeenCalled();
    });

    it('should return false when no active branch exists', async () => {
        mockedExecFile.mockImplementation(
            (
                _command: string,
                _args: string[],
                _options: unknown,
                callback: Function
            ) => {
                callback(new Error('Not a git repository'));
            }
        );

        const result = await service.postReviewComment(
            'Review comment'
        );

        expect(result).toBe(false);
    });

    it('should return false when no active PR exists', async () => {
        mockedExecFile
            .mockImplementationOnce(
                (
                    _command: string,
                    _args: string[],
                    _options: unknown,
                    callback: Function
                ) => {
                    callback(null, {
                        stdout: 'feature/test\n',
                        stderr: ''
                    });
                }
            )
            .mockImplementationOnce(
                (
                    _command: string,
                    _args: string[],
                    _options: unknown,
                    callback: Function
                ) => {
                    callback(new Error('No pull request found'));
                }
            );

        const result = await service.postReviewComment(
            'Review comment'
        );

        expect(result).toBe(false);
    });

    it('should return true when the comment is posted successfully', async () => {
        mockedExecFile
            .mockImplementationOnce(
                (
                    _command: string,
                    _args: string[],
                    _options: unknown,
                    callback: Function
                ) => {
                    callback(null, {
                        stdout: 'feature/test\n',
                        stderr: ''
                    });
                }
            )
            .mockImplementationOnce(
                (
                    _command: string,
                    _args: string[],
                    _options: unknown,
                    callback: Function
                ) => {
                    callback(null, {
                        stdout: JSON.stringify({
                            url: 'https://github.com/example/repo/pull/1',
                            title: 'Test PR'
                        }),
                        stderr: ''
                    });
                }
            )
            .mockImplementationOnce(
                (
                    _command: string,
                    _args: string[],
                    _options: unknown,
                    callback: Function
                ) => {
                    callback(null, {
                        stdout: '',
                        stderr: ''
                    });
                }
            );

        const result = await service.postReviewComment(
            'Review comment'
        );

        expect(result).toBe(true);

        expect(mockedExecFile).toHaveBeenLastCalledWith(
            'gh',
            ['pr', 'comment', '--body', 'Review comment'],
            { cwd: '/mock/workspace' },
            expect.any(Function)
        );
    });

    it('should return false when posting fails', async () => {
        mockedExecFile
            .mockImplementationOnce(
                (
                    _command: string,
                    _args: string[],
                    _options: unknown,
                    callback: Function
                ) => {
                    callback(null, {
                        stdout: 'feature/test\n',
                        stderr: ''
                    });
                }
            )
            .mockImplementationOnce(
                (
                    _command: string,
                    _args: string[],
                    _options: unknown,
                    callback: Function
                ) => {
                    callback(null, {
                        stdout: JSON.stringify({
                            url: 'https://github.com/example/repo/pull/1',
                            title: 'Test PR'
                        }),
                        stderr: ''
                    });
                }
            )
            .mockImplementationOnce(
                (
                    _command: string,
                    _args: string[],
                    _options: unknown,
                    callback: Function
                ) => {
                    callback(new Error('GitHub CLI failed'));
                }
            );

        const result = await service.postReviewComment(
            'Review comment'
        );

        expect(result).toBe(false);
    });
});