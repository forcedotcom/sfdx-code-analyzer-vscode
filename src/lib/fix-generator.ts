import * as vscode from 'vscode';

/**
 * Abstract parent class for engine-specific fix generators.
 * @abstract
 */
export abstract class FixGenerator {
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
