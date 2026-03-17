import * as vscode from "vscode";

export type CodeFixData = {
    // The document associated with the fix
    document: vscode.TextDocument

    // The diagnostic associated with the fix
    diagnostic: vscode.Diagnostic

    // The range of the original context within the document that is suggested to be replaced with a code fix
    rangeToBeFixed: vscode.Range

    // The fixed code that should replace the original context to be replaced
    fixedCode: string
}


export class FixSuggestion {
    readonly codeFixData: CodeFixData;
    private readonly explanation?: string;
    private readonly originalDocumentCode: string;
    private readonly originalCodeToBeFixed: string;
    private readonly originalLineAtStartOfFix: string;

    constructor(data: CodeFixData, explanation?: string) {
        this.codeFixData = data;
        this.explanation = explanation;

        // Since the document can change, we immediately capture a snapshot of its code to keep this FixSuggestion stable
        this.originalDocumentCode = data.document.getText();
        this.originalCodeToBeFixed = data.document.getText(this.codeFixData.rangeToBeFixed);
        this.originalLineAtStartOfFix = data.document.lineAt(this.codeFixData.rangeToBeFixed.start.line).text;
    }

    hasExplanation(): boolean {
        return this.explanation !== undefined && this.explanation.length > 0;
    }

    getExplanation(): string {
        return this.hasExplanation() ? this.explanation : '';
    }

    getOriginalCodeToBeFixed(): string {
        return this.originalCodeToBeFixed;
    }

    getOriginalDocumentCode(): string {
        return this.originalDocumentCode;
    }

    getFixedCodeLines(): string[] {
        const fixedLines: string[] = this.codeFixData.fixedCode.split(/\r?\n/);
        const commonIndentation: string = findCommonLeadingWhitespace(fixedLines);
        const trimmedFixedLines: string[] = fixedLines.map(l => l.slice(commonIndentation.length));

        // Assuming the trimmed fixed code always has an indentation amount that is <= the original, calculate the
        // indentation amount that we need to prepend onto the trimmedFixedLines to make the indentation match the
        // original file.
        const indentToAdd: string = removeSuffix(
            getLineIndentation(this.originalLineAtStartOfFix),
            getLineIndentation(trimmedFixedLines[0]));

        return trimmedFixedLines.map(line => indentToAdd + line);
    }

    getFixedCode(): string {
        return this.getFixedCodeLines().join(this.getNewLine());
    }

    getFixedDocumentCode(): string {
        const range: vscode.Range = this.codeFixData.rangeToBeFixed;
        const originalText: string = this.getOriginalDocumentCode();
        const originalLines: string[] = originalText.split(/\r?\n/);

        // Get the text before the range on the start line
        const beforeText: string = originalLines[range.start.line].substring(0, range.start.character);
        // Get the text after the range on the end line
        const afterText: string = originalLines[range.end.line].substring(range.end.character);

        const beforeLines: string[] = originalLines.slice(0, range.start.line);
        const afterLines: string[] = originalLines.slice(range.end.line + 1);

        // When range starts at char 0 (full-line replacement), use getFixedCode() which applies
        // indentation normalization. For partial-range replacements, use fixedCode directly since
        // beforeText already provides the correct positioning.
        const replacementCode: string = range.start.character === 0
            ? this.getFixedCode()
            : this.codeFixData.fixedCode;

        return [
            ...beforeLines,
            beforeText + replacementCode + afterText,
            ...afterLines
        ].join(this.getNewLine());
    }

    private getNewLine(): string {
        return this.codeFixData.document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    }
}

function findCommonLeadingWhitespace(lines: string[]): string {
    if (lines.length === 0) return '';

    // Find the minimum length of all strings
    const minLength: number = Math.min(...lines.map(l => l.length));

    let commonWhitespace: string = '';
    for (let i = 0; i < minLength; i++) {
        const c: string = lines[0][i];
        if (lines.every(l => l[i] === c && (c === ' ' || c === '\t'))) {
            commonWhitespace += c;
        } else {
            break;
        }
    }
    return commonWhitespace;
}

function getLineIndentation(lineText: string): string {
    return lineText.slice(0, lineText.length - lineText.trimStart().length);
}

function removeSuffix(text: string, suffix: string): string {
    return text.endsWith(suffix) ? text.slice(0, text.length - suffix.length) : text;
}
