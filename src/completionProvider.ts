import * as vscode from 'vscode';
import { generate } from './ollamaClient';

export class CompletionProvider implements vscode.InlineCompletionItemProvider {
    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[]> {

        if (token.isCancellationRequested) return [];

        // 1. Get context
        const prefix = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
        const suffix = document.getText(new vscode.Range(position, document.lineAt(document.lineCount - 1).range.end));

        // 2. Construct FIM prompt (Qwen/CodeLlama style)
        // <|fim_prefix|> content <|fim_suffix|> content <|fim_middle|>
        const prompt = `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`;

        try {
            // TODO: Pass 'token' to generate() to cancel requests
            const completion = await generate(prompt);

            if (token.isCancellationRequested) return [];
            if (!completion) return [];

            return [new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))];
        } catch (e) {
            console.error('Completion error:', e);
            return [];
        }
    }
}
