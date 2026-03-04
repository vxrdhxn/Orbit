import * as vscode from 'vscode';
import { PerformanceAnalyzer } from '../performance/PerformanceAnalyzer';
import { PerformanceOutputFormatter } from '../performance/PerformanceOutputFormatter';

export async function runAnalyzePerformance(analyzer: PerformanceAnalyzer, outputChannel: vscode.OutputChannel) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return;
    }

    outputChannel.show(true);
    outputChannel.appendLine('Analyzing performance... Please wait.');

    try {
        const selection = editor.selection;
        let analysis;

        if (!selection.isEmpty) {
            analysis = await analyzer.analyzeSelection(editor);
        } else {
            analysis = await analyzer.analyzeCurrentFunction(editor);
        }

        const formatter = new PerformanceOutputFormatter();
        const formattedOutput = formatter.format(analysis);

        outputChannel.clear();
        outputChannel.appendLine(formattedOutput);

    } catch (error: any) {
        outputChannel.appendLine(`\n[ERROR] Analysis failed: ${error.message}`);
        vscode.window.showErrorMessage(`Performance analysis failed: ${error.message}`);
    }
}
