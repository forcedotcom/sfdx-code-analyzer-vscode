import * as vscode from 'vscode';
import * as Constants from '../lib/constants';
import { ServiceProvider, ServiceType } from '@salesforce/vscode-service-provider';
import { StringFormatter } from '../lib/string-formatter';
import {messages} from '../lib/messages';
import path from 'path';

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

    const filteredDiagnostics = context.diagnostics.filter(diagnostic => messages.diagnostics.source && messages.diagnostics.source.isSource(diagnostic.source) && diagnostic.range.isEqual(range));

    // Loop through diagnostics in the context
    filteredDiagnostics.forEach((diagnostic) => {
      // Create a code action for each diagnostic
      const fixAction = new vscode.CodeAction(
        `Fix with A4D: ${diagnostic.message}`,
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
        const visibleRange = vscode.window.activeTextEditor.visibleRanges[0];
        const prompt = this.generatePrompt(document, diagnostic, visibleRange);

        // Get the LLM service instance
        const llmService = await ServiceProvider.getService(ServiceType.LLMService, 'sfdx-code-analyzer-vscode');

        // Call the LLM service with the generated prompt
        let codeSnippet = await llmService.callLLM(prompt, '1');
        if (codeSnippet.startsWith('```apex')) {
          codeSnippet = codeSnippet.slice(7, codeSnippet.length - 3);
        }

        const updatedFileContent = this.replaceCodeInFile(document.getText(), codeSnippet.trim(), diagnostic.range.start.line, diagnostic.range.end.line);
        // Update the command arguments with the resolved code snippet
        codeAction.command.arguments = [updatedFileContent, document.uri];

        return codeAction;
      } catch (error) {
        // Handle errors gracefully
        console.error('Failed to resolve code action:', error);
        return null; // Return null if an error occurs
      }
    })();
  }

  private generatePrompt(document:vscode.TextDocument, diagnostic: vscode.Diagnostic, visibleRange: vscode.Range): string {
    const promptFormatter = new StringFormatter(Constants.SYSTEM_PROMPT.concat(Constants.BASE_USER_PROMPT));

    return promptFormatter.substitute(
        this.getCodeInRange(visibleRange),this.extractCodeFromApexFile(document.getText(), diagnostic.range.start.line + 1, diagnostic.range.end.line + 1),
        diagnostic.message, Constants.APEX_CRUD_VIOLATION_PROMPT);
  }

  private getCodeInRange(range: vscode.Range): string {
    const editor = vscode.window.activeTextEditor;
    return editor.document.getText(range);
  }

  private extractCodeFromApexFile(
    fileContent: string,
    startLine: number,
    endLine: number
): string | null {
    // Split the file content into lines for processing
    const lines = fileContent.split("\n");

    // Validate the line numbers
    if (startLine < 1 || endLine > lines.length || startLine > endLine) {
        throw new Error("Invalid start or end line number.");
    }

    // Extract the lines between startLine and endLine (inclusive)
    const extractedLines = lines.slice(startLine - 1, endLine);
    return extractedLines.join("\n");
  }


  private replaceCodeInFile(
    fileContent: string,
    replaceCode: string,
    startLine: number,
    endLine: number
): string {
    // Split the file content into an array of lines
    const lines = fileContent.split("\n");

    if (startLine < 1 && endLine >= lines.length - 1) {
      // This means the whole file content is replaced
      return replaceCode;
    }

    // Ensure startLine and endLine are within valid ranges
    if (startLine < 1 || endLine > lines.length || startLine > endLine) {
        throw new Error("Invalid startLine or endLine values.");
    }

    // Determine the leading spaces of the first line being replaced
    const leadingSpaces = lines[startLine - 1].match(/^\s*/)?.[0] || "";

    // Add the leading spaces to each line of the replaceCode
    const indentedReplaceCode = replaceCode
        .split("\n")
        .map(line => leadingSpaces + line)
        .join("\n");

    // Replace the specified lines with the new code
    const updatedLines = [
        ...lines.slice(0, startLine),
        indentedReplaceCode,
        ...lines.slice(endLine + 1)
    ];

    // Join the lines back into a single string
    return updatedLines.join("\n");
  }

}

type CodeRange = {
  content: string;
  startLineNumber: number;
  endLineNumber: number;
};