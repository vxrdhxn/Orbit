import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel | undefined {
    if (!channel) {
        try {
            channel = vscode.window.createOutputChannel('Orbit');
        } catch {
            // Output channel unavailable (e.g. unit tests without a VS Code host).
        }
    }
    return channel;
}

/** Writes a line to the "Orbit" output channel. */
export function log(message: string): void {
    getChannel()?.appendLine(message);
}
