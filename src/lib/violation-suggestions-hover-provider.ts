import * as vscode from "vscode"
import * as Constants from "./constants";
import {CodeAnalyzerDiagnostic, DiagnosticManager, toRange} from "./diagnostics";
import { messages } from "./messages";

/**
 * Provides hover markdown for the suggestions associated with Code Analyzer Violations.
 */
export class ViolationSuggestionsHoverProvider implements vscode.HoverProvider {
    private readonly diagnosticManager: DiagnosticManager;

    constructor(diagnosticManager: DiagnosticManager) {
        this.diagnosticManager = diagnosticManager;
    }

    provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
        const allDiags: readonly CodeAnalyzerDiagnostic[] = this.diagnosticManager.getDiagnosticsForFile(document.uri);
        const diagsWithSuggestions: CodeAnalyzerDiagnostic[] = allDiags.filter(
            d => !d.isStale() && d.violation.suggestions?.length > 0);
        
        const suggestionMsgs: vscode.MarkdownString[] = [];

        // Since there is the possibility for multiple suggestions to have a location that contains the cursor position
        // of the user, so we'll need to calculate the range for the hover accordingly.
        let startPos: vscode.Position = null;
        let endPos: vscode.Position = null;
        
        // For each diagnostic with a suggestion associated with this file, we find just the suggestions in this file
        // whose location contains the provided position and create a single hover markdown for just those suggestions.
        for (const diag of diagsWithSuggestions) {
            for (const suggestion of diag.violation.suggestions) {
                const suggestionRange: vscode.Range = toRange(suggestion.location);
                if (suggestion.location.file === document.fileName && suggestionRange.contains(position)) {
                    startPos = (!startPos || suggestionRange.start.isBefore(startPos)) ? suggestionRange.start : startPos;
                    endPos = (!endPos || suggestionRange.end.isAfter(endPos)) ? suggestionRange.end : endPos;
                    suggestionMsgs.push(createMarkdownString(diag.violation.engine, diag.violation.rule, suggestion.message));
                }
            }
        }
        
        if (suggestionMsgs.length == 0) {
            return;
        }

        return new vscode.Hover(suggestionMsgs, new vscode.Range(startPos, endPos));
    }
}

function createMarkdownString(engineName: string, ruleName: string, suggestionMessage): vscode.MarkdownString {
    const copyTextCmdArgsAsString: string = encodeURIComponent(JSON.stringify([engineName, ruleName, suggestionMessage]))
    // Note we have no ability to use most style based tags. See the following for what tags/attributes are supported:
    //   https://github.com/microsoft/vscode/blob/6d2920473c6f13759c978dd89104c4270a83422d/src/vs/base/browser/markdownRenderer.ts#L296
    const markdown: vscode.MarkdownString = new vscode.MarkdownString(
        `<strong>${messages.suggestions.suggestionFor}</strong> <code>${engineName}.${ruleName}</code>: &nbsp;` +
        `<a href="command:${Constants.COMMAND_COPY_SUGGESTION}?${copyTextCmdArgsAsString}">$(copy) Copy</a>\n` + 
        `<blockquote><pre>${suggestionMessage}</pre></blockquote>`);
    markdown.supportHtml = true; // Using the limited html gives us a tiny bit more control that using straight-up markdown
    markdown.supportThemeIcons = true; // Allows for the copy icon
    markdown.isTrusted = true; // Allows the "copy" link to execute our sfca.copySuggestion command
    return markdown;
}