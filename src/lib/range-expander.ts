import * as vscode from 'vscode';

export class RangeExpander {
    /**
     * Returns an expanded range with updated character (column) positions to capture the start and end lines completely
     *     For example, the range of ([3,8],[4,3]) would be expanded to ([3,0],[4,L]) where L is the length of line 4.
     * @param document the vscode.TextDocument associated with the range
     * @param range the original vscode.Range to be expanded
     * @return the new expanded vscode.Range
     */
    expandToCompleteLines(document: vscode.TextDocument, range: vscode.Range): vscode.Range {
        return new vscode.Range(
            new vscode.Position(range.start.line, 0),
            new vscode.Position(range.end.line, document.lineAt(range.end.line).text.length)
        );
    }

    //Soon we will be adding more methods to this class to expand to the containing method, or the containing class, etc
}
