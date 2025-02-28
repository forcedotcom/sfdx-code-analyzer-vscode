/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import * as Constants from '../lib/constants';
import * as PromptConstants from './prompt-constants';
import { ServiceProvider, ServiceType } from '@salesforce/vscode-service-provider';
import { PromptBuilder } from './prompt-formatter';
import { messages } from '../lib/messages';
import { randomUUID } from 'crypto';

export class ApexPmdViolationsFixer implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];
    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _token: vscode.CancellationToken
    ): vscode.CodeAction[] {
        const codeActions: vscode.CodeAction[] = [];

        // Throw out diagnostics that aren't ours, or are for the wrong line.
        const filteredDiagnostics = context.diagnostics.filter(
            diagnostic => messages.diagnostics.source
              && messages.diagnostics.source.isSource(diagnostic.source)
              && range.contains(diagnostic.range)
              && this.isSupportedViolationForCodeFix(diagnostic));

        // Loop through diagnostics in the context
        filteredDiagnostics.forEach((diagnostic) => {
            // Create a code action for each diagnostic
            const fixAction = new vscode.CodeAction(
                `*** Fix with A4D: ${this.extractDiagnosticCode(diagnostic)} ***`,
                vscode.CodeActionKind.QuickFix
            );

            // Pass the diagnostic as an argument to the command
            fixAction.command = {
                title: 'Fix Diagnostic Issue',
                command: Constants.UNIFIED_DIFF,
                arguments: [document, diagnostic] // Pass the diagnostic here
            };

            codeActions.push(fixAction);
        });

        return codeActions;
    }

    private extractDiagnosticCode(diagnostic: vscode.Diagnostic) {
        return typeof diagnostic.code === 'object' && 'value' in diagnostic.code ? diagnostic.code.value.toString() : '';
    }

    public isSupportedViolationForCodeFix(diagnostic: vscode.Diagnostic): unknown {
        return Constants.A4D_FIX_AVAILABLE_RULES.includes(this.extractDiagnosticCode(diagnostic));
    }

    public resolveCodeAction(
        codeAction: vscode.CodeAction,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeAction> {
        return (async () => {
            try {
                // Check for cancellation before starting the resolution process
                if (token.isCancellationRequested) {
                    return null;
                }

                // Generate the prompt
                const [document, diagnostic] = codeAction.command.arguments as [vscode.TextDocument, vscode.Diagnostic];
                const prompt = this.generatePrompt(document, diagnostic);

                // Get the LLM service instance
                const llmService = await ServiceProvider.getService(ServiceType.LLMService, Constants.EXTENSION_ID);

                // Call the LLM service with the generated prompt
                const llmResponse = await llmService.callLLM(prompt, getUniqueId());
                const codeSnippet = this.extractCodeFromResponse(llmResponse);

                const updatedFileContent = this.replaceCodeInFile(document.getText(), codeSnippet.trim(), diagnostic.range.start.line + 1, diagnostic.range.end.line + 1, document);
                // Update the command arguments with the resolved code snippet
                codeAction.command.arguments = [updatedFileContent, document.uri];

                return codeAction;
            } catch (error) {
                const errorMessage = '***Failed to resolve code action:***'
                const detailedMessage = error instanceof Error 
                ? error.message
                : String(error);
                console.error(errorMessage, error);
                void vscode.window.showErrorMessage(`${errorMessage} ${detailedMessage}`);

                // We still need to provide the command arguments to avoid unintended errors being surfaced to the user
                const [document] = codeAction.command.arguments as [vscode.TextDocument];
                codeAction.command.arguments = [document.getText(), document.uri];
                return codeAction;
            }
        })();
    }

    public extractCodeFromResponse(response: string) {
        const startTag = '```apex';
        // Model returns code block with ending double backticks.
        // For now keeping double backticks to catch both double and triple backtick scenarios.
        const endTag = '``';

        const startIndex = response.indexOf(startTag);
        if (startIndex === -1) return response;

        const afterStartTag = startIndex + startTag.length;
        const endIndex = response.indexOf(endTag, afterStartTag);

        if (endIndex !== -1) {
            return response.slice(afterStartTag, endIndex).trim();
        }

        // We return the original response so we can see the response in the diff.
        // TODO: Change this to no reponse closer to releasing this as a feature to the users.
        return response;
    }

    public generatePrompt(document:vscode.TextDocument, diagnostic: vscode.Diagnostic): string {
        const promptFormatter = new PromptBuilder(PromptConstants.SYSTEM_PROMPT.concat(PromptConstants.BASE_USER_PROMPT));
        promptFormatter.withViolationCode(this.extractCodeFromFile(document.getText(), diagnostic.range.start.line + 1, diagnostic.range.end.line + 1))
        .withViolationMessage(diagnostic.message)
        .withAdditionalPrompt(PromptConstants.NO_ADDITIONAL_PROMPT);
        return promptFormatter.build();
    }

    public extractCodeFromFile(
        fileContent: string,
        startLine: number,
        endLine: number
): string | null {
        // Split the file content into lines for processing
        const lineEndingMatch = fileContent.match(/(\r\n|\r|\n)/);
        const lineEnding = lineEndingMatch ? lineEndingMatch[0] : '\n';

        const lines = fileContent.split(lineEnding);

        // Validate the line numbers
        if (startLine < 1 || endLine > lines.length || startLine > endLine) {
                throw new Error('Invalid start or end line number.');
        }

        // Extract the lines between startLine and endLine (inclusive)
        const extractedLines = lines.slice(startLine - 1, endLine);
        return extractedLines.join(lineEnding);
    }


    public replaceCodeInFile(
        fileContent: string,
        replaceCode: string,
        startLine: number,
        endLine: number,
        document?: vscode.TextDocument
    ): string {
        const lineEndingMatch = fileContent.match(/(\r\n|\r|\n)/);
        const lineEnding = lineEndingMatch ? lineEndingMatch[0] : '\n';
        // Split the file content into an array of lines
        const lines = fileContent.split(lineEnding);

        if (startLine < 1 && endLine >= lines.length - 1) {
            // This means the whole file content is replaced.
            // This happens for some fixes like the OverrideBothEqualsAndHashcode violation fix where the model returns the entire class as fix.
            // This should not happen eventually and only the fixed lines will be returned by the model.
            return replaceCode;
        }

        // Ensure startLine and endLine are within valid ranges
        if (startLine < 1 || endLine > lines.length || startLine > endLine) {
                throw new Error('Invalid startLine or endLine values.');
        }

        const indentedReplaceCode = this.formatCode(replaceCode, document, new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(endLine, Number.MAX_SAFE_INTEGER)));

        // Replace the specified lines with the new code
        const updatedLines = [
                ...lines.slice(0, startLine - 1),
                indentedReplaceCode,
                ...lines.slice(endLine)
        ];

        // Join the lines back into a single string
        return updatedLines.join(lineEnding);
    }

    private formatCode(
        replaceCode: string,
        document?: vscode.TextDocument,
        range?: vscode.Range
    ): string {
        if (!document) {
            return replaceCode;
        }
    
        // Get the indentation of the first line in the range
        const startLine = range && range.start.line > 0 ? range.start.line - 1 : 0;
        const baseIndentation = this.getLineIndentation(document, startLine);
        
        // Split the replacement code into lines
        const lines = replaceCode.split(/\r?\n/);
        
        // First, normalize the code by removing all existing indentation
        const normalizedLines = lines.map(line => line.trimStart());
        
        let indentLevel = 0;
        let braceLevel = 0;
        let parenLevel = 0;
        let bracketLevel = 0;

        // Process each line to match the document's indentation style
        const formattedLines = normalizedLines.map((line) => {
            if (line.trim() === '') {
                // Preserve empty lines without indentation
                return '';
            }
            indentLevel = braceLevel + parenLevel + bracketLevel;

            if (line.startsWith('}')) {
                braceLevel = Math.max(0, braceLevel - 1);
                indentLevel = Math.max(0, indentLevel - 1);
            }

            if (line.startsWith(')')) {
                parenLevel = Math.max(0, parenLevel - 1);
                indentLevel = Math.max(0, indentLevel - 1);
            }

            if (line.startsWith(']')) {
                bracketLevel = Math.max(0, bracketLevel - 1);
                indentLevel = Math.max(0, indentLevel - 1);
            }

            const indentation = baseIndentation + '    '.repeat(indentLevel);

            // Adjust for next lines, this line needs no changes
            if (line.endsWith('{')) {
                braceLevel++;
            } else if (line.endsWith('(')) {
                parenLevel++;
            } else if (line.endsWith('[')) {
                braceLevel++;
            }

            return indentation + line;
        });
        
        return formattedLines.join(document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n');
    }
    
    // Helper to get the indentation of a specific line
    private getLineIndentation(document: vscode.TextDocument, lineNumber: number): string {
        const lineText = document.lineAt(lineNumber).text;
        return lineText.slice(0, lineText.length - lineText.trimStart().length);
    }

    public removeDiagnosticsWithInRange(uri: vscode.Uri, range: vscode.Range, diagnosticCollection: vscode.DiagnosticCollection) {
        const currentDiagnostics = diagnosticCollection.get(uri) || [];
        // This filter looks for any overlap between the lines initially diagnostic was reported and the code fix is being suggested.
        // This might result in some false positives when multiple violations are reported for the same lines.
        // This is a known issue and we will fix this as we learn more about how the model sends the responses for other fixes.
        const updatedDiagnostics = currentDiagnostics.filter(
            diagnostic => (
                !Constants.A4D_FIX_AVAILABLE_RULES.includes(this.extractDiagnosticCode(diagnostic)) || 
                (diagnostic.range.end.line < range.start.line || diagnostic.range.start.line > range.end.line )
            )
        );
        diagnosticCollection.set(uri, updatedDiagnostics);
    }
}

export function getUniqueId(): string {
    return randomUUID();
}

