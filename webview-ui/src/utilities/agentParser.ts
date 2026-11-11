/**
 * Splits an assistant turn into the pieces the chat renders: plain markdown text,
 * tool steps (a tool call plus its result) and the model's private reasoning.
 *
 * The extension streams the raw transcript, e.g.
 *   I'll read it.<tool_call name="read">{"path":"a.ts"}</tool_call>
 *   <observation status="ok">...</observation>
 * so the same parser handles both live streaming and saved history.
 */

export interface TextPart {
    type: 'text';
    text: string;
}

export interface ThinkPart {
    type: 'think';
    text: string;
    closed: boolean;
}

export interface ToolPart {
    type: 'tool';
    name: string;
    /** Raw attributes after the name, e.g. ` path="a.ts"`. */
    attrs: string;
    body: string;
    /** False while the model is still writing the call. */
    closed: boolean;
    result?: string;
    resultStatus?: 'ok' | 'error';
}

export type AgentPart = TextPart | ThinkPart | ToolPart;

const OPEN_TAG = /<think>|<tool_call\s+name="([^"]+)"([^>]*)>|<observation([^>]*)>/g;
const KNOWN_TAG_PREFIXES = ['<tool_call', '<think>', '<observation', '</tool_call>', '</think>', '</observation>'];

/** While streaming, hides a tag that has only been half written, like `<tool_ca`. */
function trimPartialTag(text: string): string {
    const lt = text.lastIndexOf('<');
    if (lt === -1) {
        return text;
    }
    const tail = text.slice(lt);
    if (tail.includes('>')) {
        return text;
    }
    const isPrefix = KNOWN_TAG_PREFIXES.some(tag => tag.startsWith(tail) || tail.startsWith(tag.slice(0, -1)));
    return isPrefix ? text.slice(0, lt) : text;
}

export function parseAgentContent(content: string, streaming = false): AgentPart[] {
    const parts: AgentPart[] = [];
    const pushText = (text: string) => {
        if (text.trim() === '') {
            return;
        }
        const last = parts[parts.length - 1];
        if (last && last.type === 'text') {
            last.text += text;
        } else {
            parts.push({ type: 'text', text });
        }
    };

    let index = 0;
    OPEN_TAG.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = OPEN_TAG.exec(content)) !== null) {
        pushText(content.slice(index, match.index));
        const afterOpen = match.index + match[0].length;

        if (match[0] === '<think>') {
            const end = content.indexOf('</think>', afterOpen);
            const closed = end !== -1;
            parts.push({ type: 'think', text: content.slice(afterOpen, closed ? end : undefined).trim(), closed });
            index = closed ? end + '</think>'.length : content.length;
        } else if (match[1] !== undefined) {
            const end = content.indexOf('</tool_call>', afterOpen);
            const closed = end !== -1;
            parts.push({
                type: 'tool',
                name: match[1],
                attrs: match[2] || '',
                body: content.slice(afterOpen, closed ? end : undefined),
                closed
            });
            index = closed ? end + '</tool_call>'.length : content.length;
        } else {
            const end = content.indexOf('</observation>', afterOpen);
            const body = content.slice(afterOpen, end === -1 ? undefined : end).replace(/^\n|\n$/g, '');
            const status = /status="error"/.test(match[3] || '') ? 'error' : 'ok';
            // Attach the result to the most recent tool step that has none yet.
            for (let i = parts.length - 1; i >= 0; i--) {
                const part = parts[i];
                if (part.type === 'tool' && part.result === undefined) {
                    part.result = body;
                    part.resultStatus = status;
                    break;
                }
            }
            index = end === -1 ? content.length : end + '</observation>'.length;
        }
        OPEN_TAG.lastIndex = index;
    }

    const rest = content.slice(index);
    pushText(streaming ? trimPartialTag(rest) : rest);
    return parts;
}

/** Arguments of a tool call, from JSON or (for apply) from the `path` attribute. */
export function toolArgs(part: ToolPart): Record<string, any> {
    const path = part.attrs.match(/path="([^"]+)"/)?.[1];
    if (part.name === 'apply' && path) {
        return { path, code: part.body };
    }
    try {
        return JSON.parse(part.body.trim());
    } catch {
        return {};
    }
}

/** Short verb and target for a tool step, e.g. ["Read", "src/app.ts"]. */
export function describeTool(part: ToolPart): { verb: string; target: string; icon: string } {
    const args = toolArgs(part);
    switch (part.name) {
        case 'read':
            return { verb: 'Read', target: args.path ?? '', icon: 'codicon-file' };
        case 'ls':
            return { verb: 'List', target: args.path || '.', icon: 'codicon-folder' };
        case 'search':
            return { verb: 'Search', target: args.query ? `"${args.query}"` : '', icon: 'codicon-search' };
        case 'run':
            return { verb: 'Run', target: args.command ?? '', icon: 'codicon-terminal' };
        case 'apply':
            return { verb: 'Edit', target: args.path ?? '', icon: 'codicon-edit' };
        default:
            return { verb: part.name, target: '', icon: 'codicon-tools' };
    }
}
