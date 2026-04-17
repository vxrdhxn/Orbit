import * as vscode from 'vscode';
import { exec } from 'child_process';

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
    async runWithConfirmation(command: string, cwd?: string): Promise<CommandResult | null> {
        // Safety: always ask user before executing
        const choice = await vscode.window.showWarningMessage(
            `Orbit wants to run a command:\n\n${command}`,
            { modal: true, detail: `Working directory: ${cwd || 'workspace root'}` },
            'Run',
            'Cancel'
        );

        if (choice !== 'Run') {
            return null; // User cancelled
        }

        return this.execute(command, cwd);
    }

    /**
     * Runs a command directly (for trusted/internal use).
     */
    async execute(command: string, cwd?: string): Promise<CommandResult> {
        const workspacePath = cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        return new Promise((resolve) => {
            exec(command, {
                cwd: workspacePath,
                timeout: 30000, // 30s timeout
                maxBuffer: 1024 * 1024 // 1MB output buffer
            }, (error, stdout, stderr) => {
                resolve({
                    stdout: stdout || '',
                    stderr: stderr || '',
                    exitCode: error?.code || (error ? 1 : 0)
                });
            });
        });
    }

    /**
     * Opens a visible terminal and runs the command (for interactive/long-running commands).
     */
    runInTerminal(command: string, name?: string): vscode.Terminal {
        const terminal = vscode.window.createTerminal(name || `Orbit: ${command.slice(0, 30)}`);
        terminal.show();
        terminal.sendText(command);
        return terminal;
    }
}
