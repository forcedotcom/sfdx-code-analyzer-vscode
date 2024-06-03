/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';
import {messages} from './messages';
import * as Constants from './constants';

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
        // Iterate over all diagnostics.
        return context.diagnostics
            // Throw out diagnostics that aren't ours, or are for the wrong line.
            .filter(diagnostic => messages.diagnostics.source && messages.diagnostics.source.isSource(diagnostic.source) && diagnostic.range.isEqual(range))
            // Get and use the appropriate fix generator.
            .map(diagnostic => this.getFixGenerator(document, diagnostic).generateFixes())
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
        const engine: string = messages.diagnostics.source.extractEngine(diagnostic.source);

        switch (engine) {
            case 'pmd':
            case 'pmd-custom':
                return new _PmdFixGenerator(document, diagnostic);
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
    public abstract generateFixes(): vscode.CodeAction[];
}

/**
 * FixGenerator to be used by default when no FixGenerator exists for a given engine. Does nothing.
 * @private Must be exported for testing purposes, but shouldn't be used publicly, hence the leading underscore.
 */
export class _NoOpFixGenerator extends FixGenerator {
    public generateFixes(): vscode.CodeAction[] {
        return [];
    }
}

/**
 * FixGenerator to be used for PMD and Custom PMD.
 * @private Must be exported for testing purposes, but shouldn't be used publicly, hence the leading underscore.
 */
export class _PmdFixGenerator extends FixGenerator {
    /**
     * Generate an array of fixes, if possible.
     * @returns
     */
    public generateFixes(): vscode.CodeAction[] {
        const fixes: vscode.CodeAction[] = [];
        if (this.documentSupportsLineLevelSuppression()) {
            fixes.push(this.generateLineLevelSuppression());
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

        const action = new vscode.CodeAction(messages.fixer.supressOnLine, vscode.CodeActionKind.QuickFix);
        action.edit = new vscode.WorkspaceEdit();
        action.edit.insert(this.document.uri, endOfLine, " // NOPMD");
        action.diagnostics = [this.diagnostic];
        action.command = {
            command: Constants.COMMAND_REMOVE_SINGLE_DIAGNOSTIC,
            title: 'Clear Single Diagnostic',
            arguments: [this.document.uri, this.diagnostic]
        };

        return action;
    }

    private generateClassLevelSuppression(): vscode.CodeAction {
        // Find the end-of-line position of the class declaration where the diagnostic is found.
        const classStartPosition = this.findClassStartPosition(this.diagnostic, this.document);
        // const classEndOfLinePosition = 0;

        const action = new vscode.CodeAction(messages.fixer.supressOnClass, vscode.CodeActionKind.QuickFix);
        action.edit = new vscode.WorkspaceEdit();
    
        // Determine the appropriate suppression rule based on the type of diagnostic.code
        let suppressionRule: string;
        if (typeof this.diagnostic.code === 'object' && this.diagnostic.code !== null && 'value' in this.diagnostic.code) {
            suppressionRule = `PMD.${this.diagnostic.code.value}`;
        } else {
            suppressionRule = `PMD`;
        }
    
        // Extract text from the start to end of the class declaration to search for existing suppressions
        const classText = this.findLineBeforeClassStartDeclaration(classStartPosition);
        const suppressionRegex = /@SuppressWarnings\s*\(\s*'([^']*)'\s*\)/;
        const suppressionMatch = classText.match(suppressionRegex);
    
        if (suppressionMatch) {
            // If @SuppressWarnings exists, check if the rule is already present
            const existingRules = suppressionMatch[1].split(',').map(rule => rule.trim());
            if (!existingRules.includes(suppressionRule)) {
                // If the rule is not present, add it to the existing @SuppressWarnings
                const updatedRules = [...existingRules, suppressionRule].join(', ');
                const updatedSuppression = `@SuppressWarnings('${updatedRules}')`;
                const suppressionStartPosition = this.document.positionAt(classText.indexOf(suppressionMatch[0]));
                const suppressionEndPosition = this.document.positionAt(classText.indexOf(suppressionMatch[0]) + suppressionMatch[0].length);
                const suppressionRange = new vscode.Range(suppressionStartPosition, suppressionEndPosition);
                action.edit.replace(this.document.uri, suppressionRange, updatedSuppression);
            }
        } else {
            // If @SuppressWarnings does not exist, insert a new one
            const newSuppression = `@SuppressWarnings('${suppressionRule}')\n`;
            action.edit.insert(this.document.uri, classStartPosition, newSuppression);
        }
    
        action.diagnostics = [this.diagnostic];
        action.command = {
            command: Constants.COMMAND_RUN_ON_SELECTED,
            title: 'Re-run diagnostic for this file',
            arguments: [this.document.uri]
        };

        return action;
    }
    
    /**
     * Finds the start position of the class in the document.
     * Assumes that the class declaration starts with the keyword "class".
     * @returns The position at the start of the class.
     */
    private findClassStartPosition(diagnostic: vscode.Diagnostic, document: vscode.TextDocument): vscode.Position {
        const text = document.getText();
        const diagnosticLine = diagnostic.range.start.line;
    
        // Split the text into lines for easier processing
        const lines = text.split('\n');
        let classStartLine: number | undefined;
    
        // Iterate from the diagnostic line upwards to find the class declaration
        for (let lineNumber = diagnosticLine; lineNumber >= 0; lineNumber--) {
            const line = lines[lineNumber];
            // if (line.includes(' class ')) {
            if (line.match(/class\s+\w+/)) {
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
     * Assumes that the class declaration starts with the keyword "class".
     * @returns The text of the line that is one line above the class declaration.
     */
    private findLineBeforeClassStartDeclaration(classStartPosition: vscode.Position): string {
        // Ensure that there is a line before the class declaration
        if (classStartPosition.line > 0) {
            const lineBeforeClassPosition = classStartPosition.line - 1;
            const lineBeforeClass = this.document.lineAt(lineBeforeClassPosition);
            return lineBeforeClass.text;
        }

        // Return an empty string if no class declaration is found or it's the first line of the document
        return '';
    }
}
