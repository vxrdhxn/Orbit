import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';

export interface CommandResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

/**
 * Executes terminal commands with user confirmation and captures output.
 */
export class TerminalService {
    /**
     * Asks the user for confirmation, then runs a command and returns the output.
     */
    async runWithConfirmation(
        command: string,
        cwd?: string
    ): Promise<CommandResult | null> {
        if (!command || !command.trim()) {
            throw new Error('Command cannot be empty.');
        }

        const validatedCwd = await this.validateCwd(cwd);

        const choice = await vscode.window.showWarningMessage(
            `Orbit wants to run a command:\n\n${command}`,
            {
                modal: true,
                detail: `Working directory: ${validatedCwd}`
            },
            'Run',
            'Cancel'
        );

        if (choice !== 'Run') {
            return null;
        }

        return this.execute(command, validatedCwd);
    }

    /**
     * Runs a command directly (for trusted/internal use).
     */
    private async execute(command: string, cwd?: string): Promise<CommandResult> {
        if (!command || !command.trim()) {
            throw new Error('Command cannot be empty.');
        }

        const workspacePath = await this.validateCwd(cwd);

        return new Promise((resolve) => {
            exec(
                command,
                {
                    cwd: workspacePath,
                    timeout: 30000,
                    maxBuffer: 1024 * 1024
                },
                (error, stdout, stderr) => {
                    resolve({
                        stdout: stdout || '',
                        stderr: stderr || '',
                        exitCode:
                            typeof error?.code === 'number'
                                ? error.code
                                : error
                                    ? 1
                                    : 0
                    });
                }
            );
        });
    }

    /**
     * Opens a visible terminal and runs the command (for interactive/long-running commands).
     */
    async runInTerminal(
        command: string,
        name?: string,
        cwd?: string
    ): Promise<vscode.Terminal | null> {
        if (!command || !command.trim()) {
            throw new Error('Command cannot be empty.');
        }

        const validatedCwd = await this.validateCwd(cwd);
        const choice = await vscode.window.showWarningMessage(
            `Orbit wants to run a command:\n\n${command}`,
            {
                modal: true,
                detail: 'This command will run in a visible terminal.'
            },
            'Run',
            'Cancel'
        );

        if (choice !== 'Run') {
            return null;
        }

        const terminal = vscode.window.createTerminal({
            name: name || `Orbit: ${command.slice(0, 30)}`,
            cwd: validatedCwd
        });

        terminal.show();
        terminal.sendText(command);

        return terminal;
    }

    private validateCwd(cwd?: string): string {
        const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!workspaceRoot) {
            throw new Error('No workspace is open.');
        }

        const targetCwd = cwd || workspaceRoot;

        const resolvedRoot = path.resolve(workspaceRoot);
        const resolvedCwd = path.resolve(targetCwd);

        const relativePath = path.relative(
            resolvedRoot,
            resolvedCwd
        );

        if (
            relativePath === '..' ||
            relativePath.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relativePath)
        ) {
            throw new Error(
                'Access denied: working directory is outside the workspace.'
            );
        }

        return resolvedCwd;
    }
}