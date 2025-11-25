import * as vscode from "vscode";
import { CodeAnalyzerDiagnostic } from "../diagnostics";
import { messages } from "../messages";
import * as Constants from '../constants';
import { ApexCodeBoundaries } from '../apex-code-boundaries';

export class PMDSupressionsCodeActionProvider implements vscode.CodeActionProvider {
    provideCodeActions(document: vscode.TextDocument, selectedRange: vscode.Range | vscode.Selection, context: vscode.CodeActionContext): vscode.CodeAction[] {
        if (document.languageId !== 'apex') {
            return [];
        }
        
        const filteredDiagnostics: CodeAnalyzerDiagnostic[] = context.diagnostics
            .filter(d => d instanceof CodeAnalyzerDiagnostic)
            .filter(d => !d.isStale())
            .filter(d => d.violation.engine === 'pmd')
            // Technically, I don't think VS Code sends in diagnostics that aren't overlapping with the users selection,
            // but just in case they do, then this last filter is an additional sanity check just to be safe
            .filter(d => selectedRange.intersection(d.range) != undefined)
        if (filteredDiagnostics.length == 0) {
            return [];
        }
        
        // To avoid creating multiple "quick fix" suggestions for suppressing PMD violations on a single line, we keep
        // track of the line numbers where we provide the line level suppression suggestion for. Note it is assumed that
        // a PMD diagnostic can't exist on a line that already has a "// NOPMD" suppression marker.
        const suppressedLines = new Set<number>();
        return filteredDiagnostics.map(diag => generateFixes(suppressedLines, document, diag)).flat();
    }
}

const PATTERNS: Record<string, RegExp> = {
    singleLineComment: /^\s*\/\//,
    blockCommentStart: /^\s*\/\*/,
    blockCommentEnd: /\*\//,
    classDeclaration: /\b(\w+\s+)+class\s+\w+/,
    suppressionAnnotation: /@SuppressWarnings\s*\(\s*["']([^"']*)["']\s*\)/i
}

function generateFixes(suppressedLines: Set<number>, document: vscode.TextDocument, diag: CodeAnalyzerDiagnostic): vscode.CodeAction[] {
    const fixes: vscode.CodeAction[] = [];
    // We only check for the start line and not the entire range because irrespective of the range of a specific violation,
    // we add the NOPMD tag only on the first line of the violation.
    const lineNumber = diag.range.start.line;
    if (!suppressedLines.has(lineNumber)) {
        fixes.push(generateLineLevelSuppression(document, diag));
        suppressedLines.add(lineNumber);
    }
    fixes.push(generateClassLevelSuppression(document, diag));
    return fixes;
}

/**
 *
 * @returns An action that will apply a line-level suppression to the targeted diagnostic.
 */
function generateLineLevelSuppression(document: vscode.TextDocument, diag: CodeAnalyzerDiagnostic): vscode.CodeAction {
    // Create a position indicating the very end of the violation's start line.
    const endOfStartLine: vscode.Position = new vscode.Position(diag.range.start.line, Number.MAX_SAFE_INTEGER);

    const action = new vscode.CodeAction(messages.fixer.suppressPMDViolationsOnLine, vscode.CodeActionKind.QuickFix);
    action.edit = new vscode.WorkspaceEdit();
    action.edit.insert(document.uri, endOfStartLine, " // NOPMD");
    action.diagnostics = [diag];
    action.command = {
        command: Constants.QF_COMMAND_CLEAR_DIAGNOSTICS,
        title: 'Clear PMD Diagnostics on Line',
        // Clear only PMD violations in the range, leaving other engine violations intact
        arguments: [document.uri, { range: diag.range, engineName: 'pmd' }]
    };

    return action;
}

function generateClassLevelSuppression(document: vscode.TextDocument, diag: CodeAnalyzerDiagnostic): vscode.CodeAction {
    // Find the start position of the class that contains the diagnostic
    const boundaries: ApexCodeBoundaries = ApexCodeBoundaries.forApexCode(document.getText());
    const classStartLine: number | undefined = boundaries.getStartLineOfClassThatContainsLine(diag.range.start.line);
    const classStartPosition = classStartLine !== undefined 
        ? new vscode.Position(classStartLine, 0)
        : new vscode.Position(0, 0); // Default to the start of the document if class is not found

    const ruleName: string = diag.violation.rule;
    const suppressionTag: string = `PMD.${ruleName}`;
    const suppressMsg: string = messages.fixer.suppressPmdViolationsOnClass(ruleName);

    const action = new vscode.CodeAction(suppressMsg, vscode.CodeActionKind.QuickFix);
    action.edit = new vscode.WorkspaceEdit();

    // Extract text from the start to end of the class declaration to search for existing suppressions
    const classText = findLineBeforeClassStartDeclaration(classStartPosition, document);
    const suppressionMatch = classText.match(PATTERNS.suppressionAnnotation);

    if (suppressionMatch) {
        // If @SuppressWarnings exists, check if the rule is already present
        const existingSuppressionTags = suppressionMatch[1].split(',').map(rule => rule.trim());
        if (!existingSuppressionTags.includes(suppressionTag)) {
            // If the rule is not present, add it to the existing @SuppressWarnings
            const updatedSuppressionTagsList = [...existingSuppressionTags, suppressionTag].join(',');
            
            // Extract and preserve the indentation from the original line
            // This is for handling nested classes
            const lineBeforeClass = classStartPosition.line - 1;
            const columnStart = classText.indexOf(suppressionMatch[0]);
            const indentation = classText.substring(0, columnStart);  // Get leading whitespace
            const updatedSuppression = `${indentation}@SuppressWarnings('${updatedSuppressionTagsList}')`;
            
            // Replace from start of indentation to end of annotation (entire annotation with indentation)
            const columnEnd = columnStart + suppressionMatch[0].length;
            const suppressionStartPosition = new vscode.Position(lineBeforeClass, 0);  // Start from beginning of line
            const suppressionEndPosition = new vscode.Position(lineBeforeClass, columnEnd);
            const suppressionRange = new vscode.Range(suppressionStartPosition, suppressionEndPosition);
            action.edit.replace(document.uri, suppressionRange, updatedSuppression);
        }
    } else {
        // If @SuppressWarnings does not exist, insert a new one
        // Get the indentation of the class line to match it
        const classLine = document.lineAt(classStartPosition.line).text;
        const indentation = classLine.match(/^\s*/)?.[0] || '';
        const newSuppression = `${indentation}@SuppressWarnings('${suppressionTag}')\n`;
        action.edit.insert(document.uri, classStartPosition, newSuppression);
    }

    action.diagnostics = [diag];

    // Find the class range and clear all diagnostics for this specific rule within the class
    // @SuppressWarnings is rule-specific and class-scoped
    const classRange = findRangeOfClassThatContainsStartOfDiag(document, diag);
    action.command = {
        command: Constants.QF_COMMAND_CLEAR_DIAGNOSTICS,
        title: 'Remove diagnostics for this rule in this class',
        arguments: [document.uri, { 
            range: classRange, 
            engineName: diag.violation.engine, 
            ruleName: diag.violation.rule 
        }]
    };

    return action;
}

/**
 * Finds the range of the class that contains the first line of the diagnostic.
 * 
 * This function uses ApexCodeBoundaries to find the innermost class that contains
 * the start line of the diagnostic. If the diagnostic spans multiple classes (which
 * would be unusual), this function specifically finds the class containing the
 * diagnostic's start line.
 * 
 * @param document The text document containing the Apex code
 * @param diag The diagnostic whose start line we want to find the containing class for
 * @returns A range representing the entire class from start to end. If the diagnostic
 *          is not within any class, returns the diagnostic's own range as a fallback.
 */
function findRangeOfClassThatContainsStartOfDiag(document: vscode.TextDocument, diag: CodeAnalyzerDiagnostic): vscode.Range {
    const boundaries: ApexCodeBoundaries = ApexCodeBoundaries.forApexCode(document.getText());
    
    const classStartLine: number | undefined = boundaries.getStartLineOfClassThatContainsLine(diag.range.start.line);
    const classEndLine: number | undefined = boundaries.getEndLineOfClassThatContainsLine(diag.range.start.line);
    
    // If we found both start and end, create the class range
    if (classStartLine !== undefined && classEndLine !== undefined) {
        return new vscode.Range(classStartLine, 0, classEndLine, Number.MAX_SAFE_INTEGER);
    }
    
    // Fallback: if the diagnostic is not within any class, return the diagnostic's own range
    return diag.range;
}

/**
 * Finds the entire line that is one line above a class declaration statement.
 * @returns The text of the line that is one line above the class declaration.
 */
function findLineBeforeClassStartDeclaration(classStartPosition: vscode.Position, document: vscode.TextDocument): string {
    // Ensure that there is a line before the class declaration
    if (classStartPosition.line > 0) {
        const lineBeforeClassPosition = classStartPosition.line - 1;
        const lineBeforeClass = document.lineAt(lineBeforeClassPosition);
        return lineBeforeClass.text;
    }

    // Return an empty string if it's the first line of the document
    return '';
}
