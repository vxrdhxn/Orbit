import * as vscode from 'vscode';
import { CorrectionManager } from '../CorrectionManager';

export class CorrectionHoverProvider implements vscode.HoverProvider {
    constructor(private readonly correctionManager: CorrectionManager) { }

    provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
        const corrections = this.correctionManager.getCorrectionsForFile(document.uri);
        const matching = corrections.find(c => {
            const range = new vscode.Range(c.location.startLine - 1, 0, c.location.endLine - 1, Number.MAX_VALUE);
            return range.contains(position);
        });

        if (!matching) {return undefined;}

        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;

        markdown.appendMarkdown(`### ${matching.title}\n\n`);
        markdown.appendMarkdown(`${matching.description}\n\n`);

        if (matching.suggestedFix) {
            markdown.appendMarkdown(`**Suggested Fix:**\n`);
            markdown.appendCodeblock(matching.suggestedFix.code, document.languageId);

            // Using a command link to show diff or apply
            const applyCommand = vscode.Uri.parse(`command:orbit.applyCorrection?${encodeURIComponent(JSON.stringify([matching.id]))}`);
            // Use JSON.stringify for arguments; encodeURIComponent might be needed for the whole URI but command args are passed via internal logic if regular command. 
            // Actually for markdown links to commands, arguments must be encoded JSON.

            markdown.appendMarkdown(`\n[$(check) Accept Fix](${applyCommand}) | [$(x) Reject](${applyCommand})`);
            // Note: Reject command needed
        }

        return new vscode.Hover(markdown);
    }
}
