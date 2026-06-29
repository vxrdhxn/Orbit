import * as vscode from 'vscode';
import * as path from 'path';
import { performSearch } from '../searchCommand';
import { TerminalService } from '../services/TerminalService';
import { InlineApplyService } from '../services/InlineApplyService';

export interface ToolResult {
    output: string;
    isError?: boolean;
}

export class ToolManager {
    constructor(
        private _terminalService: TerminalService,
        private _inlineApply: InlineApplyService
    ) {}

    /**
     * Dispatches a tool call by name and arguments.
     */
    async callTool(name: string, args: any): Promise<ToolResult> {
        console.log(`[ToolManager] Calling tool: ${name}`, args);
        try {
            switch (name) {
                case 'ls':
                    return await this.listDir(args.path);
                case 'read':
                    return await this.readFile(args.path);
                case 'search':
                    return await this.search(args.query);
                case 'run':
                    return await this.runCommand(args.command);
                case 'apply':
                    return await this.applyCode(args);
                default:
                    return { output: `Unknown tool: ${name}`, isError: true };
            }
        } catch (e: any) {
            return { output: `Error executing tool ${name}: ${e.message}`, isError: true };
        }
    }

    private async listDir(dirPath: string = '.'): Promise<ToolResult> {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) {throw new Error('No workspace open');}
        
        const uri = vscode.Uri.joinPath(ws.uri, dirPath);
        const entries = await vscode.workspace.fs.readDirectory(uri);
        
        const output = entries
            .map(([name, type]) => `${type === vscode.FileType.Directory ? '[DIR]' : '[FILE]'} ${name}`)
            .join('\n');
            
        return { output: output || '(Empty directory)' };
    }

    private async readFile(filePath: string): Promise<ToolResult> {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) {throw new Error('No workspace open');}
        
        const uri = vscode.Uri.joinPath(ws.uri, filePath);
        const bytes = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(bytes).toString('utf8');
        
        return { output: content };
    }

    private async search(query: string): Promise<ToolResult> {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) {throw new Error('No workspace open');}
        
        const results = await performSearch(query, ws.uri);
        if (results.length === 0) {return { output: 'No semantic matches found.' };}
        
        const output = results.map(r => 
            `--- ${r.entry.file} ---\n${r.entry.text.slice(0, 500)}...`
        ).join('\n\n');
        
        return { output };
    }

    private async runCommand(command: string): Promise<ToolResult> {
        const result = await this._terminalService.runWithConfirmation(command);
        if (!result) {return { output: 'Command cancelled by user.', isError: true };}
        
        let output = result.stdout;
        if (result.stderr) {output += `\nError Output:\n${result.stderr}`;}
        if (result.exitCode !== 0) {output += `\nExited with code: ${result.exitCode}`;}
        
        return { output: output || '(No output)' };
    }

    private async applyCode(args: any): Promise<ToolResult> {
        const filePath = args.path;
        const code = args.code;
        if (!filePath || typeof code !== 'string') {
            return { output: 'Failed to apply code. Missing required arguments: "path" (string) and "code" (string). Note: Ensure your JSON formatting is correct and escaping newlines appropriately.', isError: true };
        }
        
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) {throw new Error('No workspace open');}
        
        const fullPath = path.isAbsolute(filePath) 
            ? filePath 
            : path.join(ws.uri.fsPath, filePath);

        const accepted = await this._inlineApply.proposeChange(fullPath, code);
        return { 
            output: accepted ? 'Changes accepted and applied.' : 'Changes rejected by user.',
            isError: !accepted
        };
    }

    /**
     * Returns the tool definitions for the system prompt.
     */
    getToolDefinitions(): string {
        return `
AVAILABLE TOOLS:
1. ls: List files in a directory. Args: { "path": string (optional, default ".") }
2. read: Read the full content of a file. Args: { "path": string }
3. search: Perform a semantic search for code blocks. Args: { "query": string }
4. run: Run a terminal command (requires user approval). Args: { "command": string }
5. apply: Propose code changes to a file (opens diff for user approval). Args: { "path": string, "code": string }

TOOL CALL FORMAT:
To use a tool, output a block like this:
<tool_call name="tool_name">
{ "arg1": "value1" }
</tool_call>

You can only call ONE tool at a time. After calling a tool, wait for the observation result.
`;
    }
}
