import * as vscode from "vscode";

export type CodeFixData = {
    // The document associated with the fix
    document: vscode.TextDocument

    // The diagnostic associated with the fix
    diagnostic: vscode.Diagnostic

    // The range of the original context within the document that is suggested to be replaced with a code fix
    // IMPORTANT: It is assumed that this range includes the entire start and end lines and not partial
    rangeToBeFixed: vscode.Range

    // The fixed code that should replace the original context to be replaced
    fixedCode: string
}


// IMPORTANT: Currently the CodeFixData contains the document and not a copy of the original document code, so the methods in this class
// assume that you have not modified the document. Otherwise, the rangeToBeFixed will be associated with the newly modified document.
export class FixSuggestion {
    readonly codeFixData: CodeFixData;
    private readonly explanation?: string;

    constructor(data: CodeFixData, explanation?: string) {
        this.codeFixData = data;
        this.explanation = explanation;
    }

    hasExplanation(): boolean {
        return this.explanation !== undefined && this.explanation.length > 0;
    }

    getExplanation(): string {
        return this.hasExplanation() ? this.explanation : '';
    }

    getOriginalCodeToBeFixed(): string {
        return this.codeFixData.document.getText(this.codeFixData.rangeToBeFixed);
    }

    getFixedCode(): string {
        return this.getFixedCodeLinesWithCorrectedIndentation().join(this.getNewLine());
    }

    getOriginalDocumentCode(): string {
        return this.codeFixData.document.getText();
    }

    getFixedDocumentCode(): string {
        const originalLines: string[] = this.getOriginalDocumentCode().split(/\r?\n/);
        const originalBeforeLines: string[] = originalLines.slice(0, this.codeFixData.rangeToBeFixed.start.line);
        const originalAfterLines: string[] = originalLines.slice(this.codeFixData.rangeToBeFixed.end.line+1);

        return [
            ... originalBeforeLines,
            ... this.getFixedCodeLinesWithCorrectedIndentation(),
            ... originalAfterLines
        ].join(this.getNewLine());
    }

    private getFixedCodeLinesWithCorrectedIndentation(): string[] {
        const fixedLines: string[] = this.codeFixData.fixedCode.split(/\r?\n/);
        const commonIndentation: string = findCommonLeadingWhitespace(fixedLines);
        const trimmedFixedLines: string[] = fixedLines.map(l => l.slice(commonIndentation.length));

        // Assuming the trimmed fixed code always has an indentation amount that is <= the original, calculate the
        // indentation amount that we need to prepend onto the trimmedFixedLines to make the indentation match the
        // original file.
        const indentToAdd: string = removeSuffix(
            getLineIndentation(this.codeFixData.document.lineAt(this.codeFixData.rangeToBeFixed.start.line).text),
            getLineIndentation(trimmedFixedLines[0]));

        return trimmedFixedLines.map(line => indentToAdd + line);
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
