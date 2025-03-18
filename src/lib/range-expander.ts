import * as vscode from 'vscode';
import {ApexCodeBoundaries} from "./apex-code-boundaries";

// TODO: Look into seeing if we can get this information from the Apex LSP if it is available and only as a backup
// should we use the custom ApexCodeBoundaries class.


export class RangeExpander {
    private readonly document: vscode.TextDocument;

    constructor(document: vscode.TextDocument) {
        this.document = document;
    }

    /**
     * Returns an expanded range with updated character (column) positions to capture the start and end lines completely
     *     For example, the range of ([3,8],[4,3]) would be expanded to ([3,0],[4,L]) where L is the length of line 4.
     * @param range the original vscode.Range to be expanded
     * @return the new expanded vscode.Range
     */
    expandToCompleteLines(range: vscode.Range): vscode.Range {
        return new vscode.Range(range.start.line, 0, range.end.line, this.document.lineAt(range.end.line).text.length);
    }

    /**
     * Returns an expanded range to for the entire method that includes the provided range
     * If the provided range is not within a method, then we attempt to return an expanded range for the class, and
     * if not in the class then we return a range for the whole file.
     *
     * @param range the original vscode.Range to be expanded
     * @return the new expanded vscode.Range
     */
    expandToMethod(range: vscode.Range): vscode.Range {
        const boundaries: ApexCodeBoundaries = ApexCodeBoundaries.forApexCode(this.document.getText());

        let startLine: number = range.start.line;
        while (!boundaries.isStartOfMethod(startLine)) {
            if (startLine === 0 || boundaries.isStartOfClass(startLine)) {
                return this.expandToClass(range);
            }
            startLine--;
        }

        let endLine: number = range.end.line;
        while (!boundaries.isEndOfMethod(endLine)) {
            if (boundaries.isEndOfClass(endLine) || boundaries.isEndOfCode(endLine)) {
                return this.expandToClass(range);
            }
            endLine++;
        }

        return new vscode.Range(startLine, 0, endLine, this.document.lineAt(endLine).text.length);
    }

    /**
     * Returns an expanded range to for the entire class that includes the provided range
     * If not within a class, then we return a range for the whole file.
     *
     * @param range the original vscode.Range to be expanded
     * @return the new expanded vscode.Range
     */
    expandToClass(range: vscode.Range): vscode.Range {
        const boundaries: ApexCodeBoundaries = ApexCodeBoundaries.forApexCode(this.document.getText());

        let inInnerClass: boolean = false;

        let startLine: number = range.start.line;
        while (startLine !== 0 && (!boundaries.isStartOfClass(startLine) || inInnerClass)) {
            if (boundaries.isEndOfClass(startLine)) {
                inInnerClass = true;
            }
            if (inInnerClass && boundaries.isStartOfClass(startLine)) {
                inInnerClass = false;
            }
            startLine--;
        }

        inInnerClass = false;
        let endLine: number = startLine; // Start back at the top so that we can track inner classes vs outer classes
        while (!boundaries.isEndOfCode(endLine) && (!boundaries.isEndOfClass(endLine) || inInnerClass)) {
            if (startLine != endLine && boundaries.isStartOfClass(endLine)) {
                inInnerClass = true;
            }
            if (inInnerClass && boundaries.isEndOfClass(endLine)) {
                inInnerClass = false;
            }
            endLine++;
        }

        // Since we resent the endLine (a few lines up) to be startLine to track inner classes, we do one final resolve
        // in case we stopped prior to the original end range
        endLine = range.end.line > endLine ? range.end.line : endLine;

        return new vscode.Range(startLine, 0, endLine, this.document.lineAt(endLine).text.length);
    }
}
