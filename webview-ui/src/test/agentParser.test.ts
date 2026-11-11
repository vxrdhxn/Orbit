import { describe, it, expect } from 'vitest';
import { parseAgentContent, describeTool, ToolPart } from '../utilities/agentParser';

describe('parseAgentContent', () => {
    it('splits text, a tool call and its result', () => {
        const parts = parseAgentContent(
            'Let me look.<tool_call name="read">{"path":"src/a.ts"}</tool_call>\n<observation status="ok">\nconst a = 1;\n</observation>\nIt defines a.'
        );
        expect(parts.map(p => p.type)).toEqual(['text', 'tool', 'text']);
        const tool = parts[1] as ToolPart;
        expect(tool.result).toBe('const a = 1;');
        expect(tool.resultStatus).toBe('ok');
        expect(describeTool(tool)).toMatchObject({ verb: 'Read', target: 'src/a.ts' });
    });

    it('marks error results', () => {
        const parts = parseAgentContent('<tool_call name="run">{"command":"npm test"}</tool_call><observation status="error">boom</observation>');
        expect((parts[0] as ToolPart).resultStatus).toBe('error');
    });

    it('treats an unclosed call as still being written', () => {
        const parts = parseAgentContent('Editing.<tool_call name="apply" path="a.js">console.log(1)', true);
        const tool = parts[1] as ToolPart;
        expect(tool.closed).toBe(false);
        expect(describeTool(tool)).toMatchObject({ verb: 'Edit', target: 'a.js' });
    });

    it('hides a half-written tag while streaming', () => {
        const parts = parseAgentContent('Sure, reading it <tool_ca', true);
        expect(parts).toEqual([{ type: 'text', text: 'Sure, reading it ' }]);
    });

    it('keeps normal comparisons in text', () => {
        const parts = parseAgentContent('a < b', true);
        expect(parts).toEqual([{ type: 'text', text: 'a < b' }]);
    });
});
