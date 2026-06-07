import { StructuredResponse, ValidationResult } from './types';

export class ResponseFormatter {
    private static readonly MIN_SECTION_LENGTH = 10;

    /**
     * Validates if a structured response contains all required sections with sufficient length.
     */
    public validate(response: Partial<StructuredResponse>): ValidationResult {
        const requiredSections: (keyof StructuredResponse)[] = ['what', 'why', 'improvements', 'tradeoffs', 'production'];
        const missingSections: string[] = [];
        const errors: string[] = [];

        for (const section of requiredSections) {
            const content = response[section];

            if (!content) {
                missingSections.push(section);
                errors.push(`Missing section: ${section}`);
                continue;
            }

            if (Array.isArray(content)) {
                if (content.length === 0) {
                    missingSections.push(section);
                    errors.push(`Section ${section} is empty`);
                } else {
                    const totalLength = content.join(' ').trim().length;
                    if (totalLength < ResponseFormatter.MIN_SECTION_LENGTH) {
                        errors.push(`Section ${section} is too short (min ${ResponseFormatter.MIN_SECTION_LENGTH} chars)`);
                        missingSections.push(section);
                    }
                }
            } else if (typeof content === 'string') {
                if (content.trim().length < ResponseFormatter.MIN_SECTION_LENGTH) {
                    errors.push(`Section ${section} is too short (min ${ResponseFormatter.MIN_SECTION_LENGTH} chars)`);
                    missingSections.push(section);
                }
            } else {
                errors.push(`Invalid type for section ${section}`);
                missingSections.push(section);
            }
        }

        return {
            isValid: missingSections.length === 0,
            missingSections,
            errors
        };
    }

    /**
     * Renders a StructuredResponse as formatted Markdown.
     */
    public renderMarkdown(response: StructuredResponse): string {
        let markdown = '';

        if (response.what && response.what.length > 0) {
            markdown += '### What changed\n';
            response.what.forEach(item => {
                markdown += `- ${item}\n`;
            });
            markdown += '\n';
        }

        if (response.why) {
            markdown += '### Why\n';
            markdown += `${response.why}\n\n`;
        }

        if (response.improvements) {
            markdown += '### Improvements\n';
            markdown += `${response.improvements}\n\n`;
        }

        if (response.tradeoffs) {
            markdown += '### Tradeoffs\n';
            markdown += `${response.tradeoffs}\n\n`;
        }

        if (response.production) {
            markdown += '### Production Considerations\n';
            markdown += `${response.production}\n\n`;
        }

        return markdown.trim();
    }

    /**
     * Renders a StructuredResponse as HTML for webview display.
     */
    public renderWebview(response: StructuredResponse): string {
        let html = '<div class="structured-reasoning">';

        if (response.what && response.what.length > 0) {
            html += '<div class="reasoning-section"><h4>What changed</h4><ul>';
            response.what.forEach(item => {
                // Basic HTML escaping
                const escaped = this.escapeHtml(item);
                html += `<li>${escaped}</li>`;
            });
            html += '</ul></div>';
        }

        html += this.renderHtmlSection('Why', response.why);
        html += this.renderHtmlSection('Improvements', response.improvements);
        html += this.renderHtmlSection('Tradeoffs', response.tradeoffs);
        html += this.renderHtmlSection('Production Considerations', response.production);

        html += '</div>';
        return html;
    }

    private renderHtmlSection(title: string, content: string): string {
        if (!content) {return '';}

        // Very basic markdown to HTML for code blocks within content
        const htmlContent = content
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br/>');

        return `<div class="reasoning-section"><h4>${title}</h4><p>${htmlContent}</p></div>`;
    }

    private escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * Extracts code blocks from raw text, replacing them with placeholders,
     * to prevent regex parsing from mistakenly matching section headers inside code blocks.
     */
    public extractCodeBlocks(text: string): {
        processedText: string,
        codeBlocks: Map<string, string>
    } {
        const codeBlocks = new Map<string, string>();
        let processedText = text;

        // Match both single line and multiline code blocks
        // Using a replacer function to collect blocks and replace with placeholders
        let counter = 0;

        // Multi-line code blocks
        processedText = processedText.replace(/```[\s\S]*?```/g, (match) => {
            const placeholder = `__CODE_BLOCK_${counter++}__`;
            codeBlocks.set(placeholder, match);
            return placeholder;
        });

        // Single-line inline code
        processedText = processedText.replace(/`[^`]+`/g, (match) => {
            const placeholder = `__INLINE_CODE_${counter++}__`;
            codeBlocks.set(placeholder, match);
            return placeholder;
        });

        return { processedText, codeBlocks };
    }

    /**
     * Restores code blocks into text using the placeholders map.
     */
    public restoreCodeBlocks(text: string, codeBlocks: Map<string, string>): string {
        let restoredText = text;

        codeBlocks.forEach((code, placeholder) => {
            restoredText = restoredText.replace(placeholder, code);
        });

        return restoredText;
    }
}
