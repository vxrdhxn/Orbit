/**
 * Parses fenced code blocks from a markdown string.
 * Supports optional file path annotations like: ```typescript:src/utils.ts
 */
export interface ParsedCodeBlock {
    language: string;
    filePath?: string;     // e.g., "src/utils.ts" from ```ts:src/utils.ts
    code: string;
    raw: string;           // The full fenced block including backticks
}

const LANG_TO_EXT: Record<string, string[]> = {
    typescript: ['.ts', '.tsx'],
    javascript: ['.js', '.jsx', '.mjs'],
    python: ['.py'],
    java: ['.java'],
    csharp: ['.cs'],
    cpp: ['.cpp', '.cc', '.cxx', '.h', '.hpp'],
    c: ['.c', '.h'],
    go: ['.go'],
    rust: ['.rs'],
    ruby: ['.rb'],
    php: ['.php'],
    swift: ['.swift'],
    kotlin: ['.kt', '.kts'],
    html: ['.html', '.htm'],
    css: ['.css'],
    scss: ['.scss'],
    json: ['.json'],
    yaml: ['.yml', '.yaml'],
    xml: ['.xml'],
    sql: ['.sql'],
    bash: ['.sh', '.bash'],
    shell: ['.sh'],
    powershell: ['.ps1'],
    markdown: ['.md'],
    tsx: ['.tsx'],
    jsx: ['.jsx'],
};

const TERMINAL_LANGUAGES = new Set(['bash', 'shell', 'sh', 'powershell', 'cmd', 'bat', 'zsh', 'terminal', 'console']);

/**
 * Extract all fenced code blocks from a markdown string.
 */
export function parseCodeBlocks(markdown: string): ParsedCodeBlock[] {
    const blocks: ParsedCodeBlock[] = [];
    // Match ```lang or ```lang:filepath
    const regex = /```([^\n]*)\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(markdown)) !== null) {
        const header = match[1].trim();
        const code = match[2];
        const raw = match[0];

        let language = '';
        let filePath: string | undefined;

        if (header.includes(':')) {
            // Format: ```typescript:src/utils.ts
            const colonIdx = header.indexOf(':');
            language = header.slice(0, colonIdx).trim().toLowerCase();
            filePath = header.slice(colonIdx + 1).trim();
        } else {
            language = header.toLowerCase();
        }

        // Skip empty code blocks
        if (!code.trim()) {continue;}

        blocks.push({ language, filePath, code, raw });
    }

    return blocks;
}

/**
 * Check if a language maps to a file extension.
 */
export function languageMatchesFile(language: string, filePath: string): boolean {
    const ext = '.' + filePath.split('.').pop()?.toLowerCase();
    const exts = LANG_TO_EXT[language];
    if (exts) {return exts.includes(ext);}

    // Fallback: check if extension starts with the language name
    return ext === '.' + language;
}

/**
 * Check if a language is a terminal/shell command.
 */
export function isTerminalLanguage(language: string): boolean {
    return TERMINAL_LANGUAGES.has(language);
}
