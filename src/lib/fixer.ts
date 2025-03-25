/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';
import {messages} from './messages';
import * as Constants from './constants';
import { extractRuleName } from './diagnostics';

/**
 * Class for creating and adding {@link vscode.CodeAction}s allowing violations to be fixed or suppressed.
 */
export class Fixer implements vscode.CodeActionProvider {
    /**
     * Adds {@link vscode.CodeAction}s to the provided document.
     * @param document The document to which actions should be added.
     * @param range The range the generated actions should modify.
     * @param context The context in which diagnostics exist.
     * @returns All actions corresponding to diagnostics in the specified range of the target document.
     */
    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
        const processedLines = new Set<number>();
        // Iterate over all diagnostics.
        return context.diagnostics
            // Throw out diagnostics that aren't ours, or are for the wrong line.
            .filter(diagnostic =>
                diagnostic.source &&
                diagnostic.source.endsWith(messages.diagnostics.source.suffix)
                && range.contains(diagnostic.range))
            // Get and use the appropriate fix generator.
            .map(diagnostic => this.getFixGenerator(document, diagnostic).generateFixes(processedLines, document, diagnostic))
            // Combine all the fixes into one array.
            .reduce((acc, next) => [...acc, ...next], []);
    }

    /**
     * Gets a {@link FixGenerator} corresponding to the engine that created the given diagnostic,
     * or a {@link _NoOpFixGenerator} if no engine-specific generator is available.
     * @param document
     * @param diagnostic
     * @returns
     */
    private getFixGenerator(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): FixGenerator {
        const engineName: string = diagnostic.source?.split(' ')[0];
        switch (engineName) {
            case 'pmd':
            case 'pmd-custom':
                return new _PmdFixGenerator(document, diagnostic);
            case 'apexguru':
                return new _ApexGuruFixGenerator(document, diagnostic);
            default:
                return new _NoOpFixGenerator(document, diagnostic);
        }
    }
}

/**
 * Abstract parent class for engine-specific fix generators.
 * @abstract
 */
abstract class FixGenerator {
    protected document: vscode.TextDocument;
    protected diagnostic: vscode.Diagnostic;

    /**
     *
     * @param document A document to which fixes should be added
     * @param diagnostic The diagnostic from which fixes should be generated
     */
    public constructor(document: vscode.TextDocument, diagnostic: vscode.Diagnostic) {
        this.document = document;
        this.diagnostic = diagnostic;
    }

    /**
     * Abstract template method for generating fixes.
     * @abstract
     */
    public abstract generateFixes(processedLines: Set<number>, document?: vscode.TextDocument, diagnostic?: vscode.Diagnostic): vscode.CodeAction[];
}

/**
 * FixGenerator to be used by default when no FixGenerator exists for a given engine. Does nothing.
 * @private Must be exported for testing purposes, but shouldn't be used publicly, hence the leading underscore.
 */
export class _NoOpFixGenerator extends FixGenerator {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public generateFixes(processedLines: Set<number>): vscode.CodeAction[] {
        return [];
    }
}

export class _ApexGuruFixGenerator extends FixGenerator {
    /**
     * Generate an array of fixes, if possible.
     * @returns
     */
    public generateFixes(processedLines: Set<number>, document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction[] {
        console.log(diagnostic);
        const fixes: vscode.CodeAction[] = [];
        const lineNumber = this.diagnostic.range.start.line;
        if (!processedLines.has(lineNumber)) {
            fixes.push(this.generateApexGuruSuppresssion(document))
            processedLines.add(lineNumber);
        }
        return fixes;
    }

    public generateApexGuruSuppresssion(document: vscode.TextDocument): vscode.CodeAction {
        const suggestedCode = this.diagnostic.relatedInformation[1].message;

        const action = new vscode.CodeAction(messages.fixer.fixWithApexGuruSuggestions, vscode.CodeActionKind.QuickFix);
        action.diagnostics = [this.diagnostic];
        const range = this.diagnostic.range;  // Assuming the range is the location of the existing code in the document
        const diagnosticStartLine = new vscode.Position(range.start.line, range.start.character);

        action.command = {
            title: 'Apply ApexGuru Fix',
            command: Constants.QF_COMMAND_INCLUDE_APEX_GURU_SUGGESTIONS,
            arguments: [document, diagnosticStartLine, suggestedCode + '\n']
        }

        return action;
    }

}

/**
 * FixGenerator to be used for PMD and Custom PMD.
 * @private Must be exported for testing purposes, but shouldn't be used publicly, hence the leading underscore.
 */
export class _PmdFixGenerator extends FixGenerator {
    public singleLineCommentPattern = /^\s*\/\//;
    public blockCommentStartPattern = /^\s*\/\*/;
    public blockCommentEndPattern = /\*\//;
    public classDeclarationPattern = /\b(\w+\s+)+class\s+\w+/;
    public suppressionRegex = /@SuppressWarnings\s*\(\s*["']([^"']*)["']\s*\)/i;

    /**
     * Generate an array of fixes, if possible.
     * @returns
     */
    public generateFixes(processedLines: Set<number>): vscode.CodeAction[] {
        const fixes: vscode.CodeAction[] = [];
        if (this.documentSupportsLineLevelSuppression()) {
            // We only check for the start line and not the entire range because irrespective of the range of a specific violation,
            // we add the NOPMD tag only on the first line of the violation.
            const lineNumber = this.diagnostic.range.start.line;
            if (!processedLines.has(lineNumber)) {
                fixes.push(this.generateLineLevelSuppression());
                processedLines.add(lineNumber);
            }
            fixes.push(this.generateClassLevelSuppression());
        }
        return fixes;
    }

    /**
     * Not all languages support line-level PMD violation suppression. This method
     * verifies that the target document does.
     * @returns
     */
    private documentSupportsLineLevelSuppression(): boolean {
        const lang = this.document.languageId;
        // Of the languages we support, Apex and Java are the ones
        // that support line-level suppression.
        return lang === 'apex' || lang === 'java';
    }

    /**
     *
     * @returns An action that will apply a line-level suppression to the targeted diagnostic.
     */
    private generateLineLevelSuppression(): vscode.CodeAction {
        // Create a position indicating the very end of the violation's start line.
        const endOfLine: vscode.Position = new vscode.Position(this.diagnostic.range.start.line, Number.MAX_SAFE_INTEGER);

        const action = new vscode.CodeAction(messages.fixer.suppressPMDViolationsOnLine, vscode.CodeActionKind.QuickFix);
        action.edit = new vscode.WorkspaceEdit();
        action.edit.insert(this.document.uri, endOfLine, " // NOPMD");
        action.diagnostics = [this.diagnostic];
        action.command = {
            command: Constants.QF_COMMAND_DIAGNOSTICS_IN_RANGE,
            title: 'Clear Single Diagnostic',
            arguments: [this.document.uri, this.diagnostic.range]
        };

        return action;
    }

    public generateClassLevelSuppression(): vscode.CodeAction {
        // Find the end-of-line position of the class declaration where the diagnostic is found.
        const classStartPosition = this.findClassStartPosition(this.diagnostic, this.document);

        const ruleName: string = extractRuleName(this.diagnostic);
        const suppressionTag: string = ruleName ? `PMD.${ruleName}` :
            `PMD`; // TODO: Figure out when this would ever be the case?? I don't think we should blindly suppress everything
        const suppressMsg: string = messages.fixer.suppressPmdViolationsOnClass(ruleName);

        const action = new vscode.CodeAction(suppressMsg, vscode.CodeActionKind.QuickFix);
        action.edit = new vscode.WorkspaceEdit();

        // Extract text from the start to end of the class declaration to search for existing suppressions
        const classText = this.findLineBeforeClassStartDeclaration(classStartPosition, this.document);
        const suppressionMatch = classText.match(this.suppressionRegex);

        if (suppressionMatch) {
            // If @SuppressWarnings exists, check if the rule is already present
            const existingRules = suppressionMatch[1].split(',').map(rule => rule.trim());
            if (!existingRules.includes(suppressionTag)) {
                // If the rule is not present, add it to the existing @SuppressWarnings
                const updatedRules = [...existingRules, suppressionTag].join(', ');
                const updatedSuppression = this.generateUpdatedSuppressionTag(updatedRules, this.document.languageId);
                const suppressionStartPosition = this.document.positionAt(classText.indexOf(suppressionMatch[0]));
                const suppressionEndPosition = this.document.positionAt(classText.indexOf(suppressionMatch[0]) + suppressionMatch[0].length);
                const suppressionRange = new vscode.Range(suppressionStartPosition, suppressionEndPosition);
                action.edit.replace(this.document.uri, suppressionRange, updatedSuppression);
            }
        } else {
            // If @SuppressWarnings does not exist, insert a new one
            const newSuppression = this.generateNewSuppressionTag(suppressionTag, this.document.languageId);
            action.edit.insert(this.document.uri, classStartPosition, newSuppression);
        }

        action.diagnostics = [this.diagnostic];
        action.command = {
            command: Constants.COMMAND_REMOVE_DIAGNOSTICS_ON_SELECTED_FILE,
            title: 'Remove diagnostics for this file',
            arguments: [this.document.uri]
        };

        return action;
    }

    public generateUpdatedSuppressionTag(updatedRules: string, lang: string) {
        if (lang === 'apex') {
            return `@SuppressWarnings('${updatedRules}')`;
        } else if (lang === 'java') {
            return `@SuppressWarnings("${updatedRules}")`;
        }
        return '';
    }

    public generateNewSuppressionTag(suppressionRule: string, lang: string) {
        if (lang === 'apex') {
            return `@SuppressWarnings('${suppressionRule}')\n`;
        } else if (lang === 'java') {
            return `@SuppressWarnings("${suppressionRule}")\n`;
        }
        return '';
    }

    /**
     * Finds the start position of the class in the document.
     * Assumes that the class declaration starts with the keyword "class".
     * @returns The position at the start of the class.
     */
    public findClassStartPosition(diagnostic: vscode.Diagnostic, document: vscode.TextDocument): vscode.Position {
        const text = document.getText();
        const diagnosticLine = diagnostic.range.start.line;

        // Split the text into lines for easier processing
        const lines = text.split('\n');
        let classStartLine: number | undefined;

        let inBlockComment = false;

        // Iterate from the diagnostic line upwards to find the class declaration
        for (let lineNumber = 0; lineNumber <= diagnosticLine; lineNumber++) {
            const line = lines[lineNumber];

            // Check if this line is the start of a block comment
            if (!inBlockComment && line.match(this.blockCommentStartPattern)) {
                inBlockComment = true;
                continue;
            }

            // Check if we are in the end of block comment
            if (inBlockComment && line.match(this.blockCommentEndPattern)) {
                inBlockComment = false;
                continue;
            }

            // Skip single-line comments
            if (line.match(this.singleLineCommentPattern)) {
                continue;
            }

            // Skip block comment in a single line
            if (line.match(this.blockCommentEndPattern) && line.match(this.blockCommentStartPattern)) {
                continue;
            }

            const match = line.match(this.classDeclarationPattern);
            if (!inBlockComment && match && !this.isWithinQuotes(line, match.index)) {
                classStartLine = lineNumber;
                break;
            }
        }

        if (classStartLine !== undefined) {
            return new vscode.Position(classStartLine, 0);
        }

        // Default to the start of the document if class is not found
        return new vscode.Position(0, 0);
    }

    /**
     * Finds the entire line that is one line above a class declaration statement.
     * @returns The text of the line that is one line above the class declaration.
     */
    public findLineBeforeClassStartDeclaration(classStartPosition: vscode.Position, document: vscode.TextDocument): string {
        // Ensure that there is a line before the class declaration
        if (classStartPosition.line > 0) {
            const lineBeforeClassPosition = classStartPosition.line - 1;
            const lineBeforeClass = document.lineAt(lineBeforeClassPosition);
            return lineBeforeClass.text;
        }

        // Return an empty string if it's the first line of the document
        return '';
    }

    /**
     * Helper function to check if match is within quotes
     * @param line
     * @param matchIndex
     * @returns
     */
    public isWithinQuotes(line: string, matchIndex: number): boolean {
        const beforeMatch = line.slice(0, matchIndex);
        const singleQuotesBefore = (beforeMatch.match(/'/g) || []).length;
        const doubleQuotesBefore = (beforeMatch.match(/"/g) || []).length;

        // Check if the number of quotes before the match is odd (inside quotes)
        return singleQuotesBefore % 2 !== 0 || doubleQuotesBefore % 2 !== 0
    }
}
