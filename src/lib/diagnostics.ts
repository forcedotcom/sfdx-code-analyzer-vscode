/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {messages} from './messages';
import * as vscode from 'vscode';

// For now we attempt to match the JsonViolationOutput schema as much as possible so that we don't need to transform
// the results that we read from the output json files too much. When we move away from using the CLI, then we can
// instead use the results data structures from core. But for now, see:
// - https://github.com/forcedotcom/code-analyzer-core/blob/dev/packages/code-analyzer-core/src/output-formats/results/json-run-results-format.ts
export type Violation = {
    rule: string;
    engine: string;
    message: string;
    severity: number;
    locations: CodeLocation[];
    primaryLocationIndex: number;
    tags: string[];
    resources: string[];

    // NOTE: The following fields currently do not exist our json schema, and only lives here for apex guru. Eventually
    //       these fields might get added to Code Analyzer core for engines like "eslint" and our output schemas.
    fixes?: Fix[];
    suggestions?: Suggestion[];
}

export type CodeLocation = {
    // These all should be optional just like it is over at:
    // - https://github.com/forcedotcom/code-analyzer-core/blob/dev/packages/code-analyzer-core/src/results.ts#L14
    // - and https://github.com/forcedotcom/code-analyzer-core/blob/dev/packages/code-analyzer-core/src/results.ts#L150
    file?: string;
    startLine?: number;
    startColumn?: number;
    endLine?: number;
    endColumn?: number;
    comment?: string;
}

export type Fix = {
    // The location associated with the block of original code that will be replaced by the fixed code
    location: CodeLocation;

    // The new code that will replace the block of original code
    fixedCode: string;
}

export type Suggestion = {
    // The location associated with the block of code that the suggestion is associated with
    location: CodeLocation;

    // The suggestion message
    message: string;
}

const STALE_PREFIX: string = messages.staleDiagnosticPrefix + '\n';

/**
 * Extended Diagnostic class to hold violation information and uri to make our life easier
 */
export class CodeAnalyzerDiagnostic extends vscode.Diagnostic {
    readonly violation: Violation;
    readonly uri: vscode.Uri;

    // Private - see the fromViolation method below to see assumptions made on this constructor
    private constructor(violation: Violation) {
        const primaryLocation: CodeLocation = violation.locations[violation.primaryLocationIndex];
        super(toRange(primaryLocation),
            messages.diagnostics.messageGenerator(violation.severity, violation.message.trim()),
            vscode.DiagnosticSeverity.Warning); // TODO: We should consider using 'Error' for sev 1 instead of always just using 'Warning'. Note that we reserve 'Information' for stale diagnostics.
        this.violation = violation;
        this.uri = vscode.Uri.file(primaryLocation.file);
    }

    isStale(): boolean {
        return this.message.startsWith(STALE_PREFIX);
    }

    markStale(): void {
        if (!this.isStale()) {
            this.message = STALE_PREFIX + this.message;
            this.severity = vscode.DiagnosticSeverity.Information;
        }
    }

    /**
     * IMPORTANT: This method assumes that the violation at this point has a primary code location with a file.
     *            Do not call this method on a violation that does not satisfy this assumption.
     * @param violation
     */
    static fromViolation(violation: Violation): CodeAnalyzerDiagnostic {
        if (violation.locations.length == 0 || !violation.locations[violation.primaryLocationIndex].file) {
            // We should never reach this line of code. It is just here to prevent us from making programming mistakes.
            throw new Error('An attempt to process a violation without a valid file based code location occurred. This should not happen.');
        }
        const diagnostic: CodeAnalyzerDiagnostic = new CodeAnalyzerDiagnostic(violation);

        // Some violations have ranges that are too noisy, so for now we manually fix them here while we wait on PMD to fix them:
        const rulesToReduceViolationsToSingleLine: string[] = [
            'ApexDoc',                                      // https://github.com/pmd/pmd/issues/5614
            'ApexUnitTestMethodShouldHaveIsTestAnnotation', // https://github.com/pmd/pmd/issues/5669
            'ApexUnitTestShouldNotUseSeeAllDataTrue',       // https://github.com/pmd/pmd/issues/5904
            'AvoidGlobalModifer',                           // https://github.com/pmd/pmd/issues/5668
            'ApexSharingViolations',                        // https://github.com/pmd/pmd/issues/5511
            'ClassNamingConventions',                       // https://github.com/pmd/pmd/issues/5905
            'MethodWithSameNameAsEnclosingClass',           // https://github.com/pmd/pmd/issues/5906
            'ExcessiveParameterList'];                      // https://github.com/pmd/pmd/issues/5616
        if (rulesToReduceViolationsToSingleLine.includes(violation.rule)) {
            diagnostic.range = new vscode.Range(diagnostic.range.start.line, diagnostic.range.start.character,
                diagnostic.range.start.line, Number.MAX_SAFE_INTEGER);
        }

        diagnostic.source = `${violation.engine} ${messages.diagnostics.source.suffix}`;
        diagnostic.code = violation.resources.length > 0 ? {
            target: vscode.Uri.parse(violation.resources[0]),
            value: violation.rule
        } : violation.rule;

        // For violations with multiple code locations, we should add in their locations as related information
        if (violation.locations.length > 1) {
            const relatedLocations: vscode.DiagnosticRelatedInformation[] = [];
            for (let i = 0 ; i < violation.locations.length; i++) {
                const relatedLocation: CodeLocation = violation.locations[i];
                if (i !== violation.primaryLocationIndex && relatedLocation.file) {
                    const relatedRange = toRange(relatedLocation);
                    const vscodeLocation: vscode.Location = new vscode.Location(vscode.Uri.file(relatedLocation.file), relatedRange);
                    relatedLocations.push(new vscode.DiagnosticRelatedInformation(vscodeLocation, relatedLocation.comment ?? ''));
                }
            }
            diagnostic.relatedInformation = relatedLocations;
        }

        return diagnostic;
    }
}


export interface DiagnosticManager extends vscode.Disposable {
    addDiagnostics(diags: CodeAnalyzerDiagnostic[]): void
    clearAllDiagnostics(): void
    clearDiagnostic(diag: CodeAnalyzerDiagnostic): void
    clearDiagnostics(diags: CodeAnalyzerDiagnostic[]): void
    clearDiagnosticsInRange(uri: vscode.Uri, range: vscode.Range): void
    clearDiagnosticsForFiles(uris: vscode.Uri[]): void
    getDiagnosticsForFile(uri: vscode.Uri): readonly CodeAnalyzerDiagnostic[]
    handleTextDocumentChangeEvent(event: vscode.TextDocumentChangeEvent): void
}

export class DiagnosticManagerImpl implements DiagnosticManager {
    private readonly diagnosticCollection: vscode.DiagnosticCollection;

    public constructor(diagnosticCollection: vscode.DiagnosticCollection) {
        this.diagnosticCollection = diagnosticCollection;
    }

    public addDiagnostics(diags: CodeAnalyzerDiagnostic[]) {
        const uriToDiagsMap: Map<vscode.Uri, CodeAnalyzerDiagnostic[]> = groupByUri(diags);
        for (const [uri, diags] of uriToDiagsMap) {
            this.addDiagnosticsForFile(uri, diags);
        }
    }

    public clearAllDiagnostics(): void {
        this.diagnosticCollection.clear();
    }

    public clearDiagnostic(diagnostic: CodeAnalyzerDiagnostic): void {
        const uri: vscode.Uri = diagnostic.uri;
        const currentDiagnostics: readonly CodeAnalyzerDiagnostic[] = this.getDiagnosticsForFile(uri);
        const updatedDiagnostics: CodeAnalyzerDiagnostic[] = currentDiagnostics.filter(diag => diag !== diagnostic);
        this.setDiagnosticsForFile(uri, updatedDiagnostics);
    }

    public clearDiagnostics(diags: CodeAnalyzerDiagnostic[]): void {
        diags.map(d => this.clearDiagnostic(d));
    }

    public dispose(): void {
        this.clearAllDiagnostics();
    }

    public clearDiagnosticsForFiles(uris: vscode.Uri[]): void {
        for (const uri of uris) {
            this.diagnosticCollection.delete(uri);
        }
    }

    public clearDiagnosticsInRange(uri: vscode.Uri, range: vscode.Range): void {
        const currentDiagnostics: readonly CodeAnalyzerDiagnostic[] = this.getDiagnosticsForFile(uri);
        // Only keep the diagnostics that aren't within the specified range
        const updatedDiagnostics: CodeAnalyzerDiagnostic[] = currentDiagnostics.filter(diagnostic => !range.contains(diagnostic.range));
        this.setDiagnosticsForFile(uri, updatedDiagnostics);
    }

    public getDiagnosticsForFile(uri: vscode.Uri): readonly CodeAnalyzerDiagnostic[] {
        return (this.diagnosticCollection.get(uri) || []) as readonly CodeAnalyzerDiagnostic[];
    }

    public handleTextDocumentChangeEvent(event: vscode.TextDocumentChangeEvent): void {
        const diags: readonly CodeAnalyzerDiagnostic[] = this.getDiagnosticsForFile(event.document.uri);
        if (diags.length === 0) {
            return;
        }

        for (const change of event.contentChanges) {

            // Calculating this once and passing it in instead of redoing it for each of the diagnostics
            const replacementLines: string[] = change.text.split('\n');

            const updatedDiagnostics: CodeAnalyzerDiagnostic[] = diags
                .map(diag => adjustDiagnosticToChange(diag, change, replacementLines))
                .filter(d => d !== null); // Removes the diagnostics that were marked for removal via null
            this.setDiagnosticsForFile(event.document.uri, updatedDiagnostics);
        }
    }

    private addDiagnosticsForFile(uri: vscode.Uri, newDiags: CodeAnalyzerDiagnostic[]): void {
        const currentDiags: readonly CodeAnalyzerDiagnostic[] = this.getDiagnosticsForFile(uri);
        this.setDiagnosticsForFile(uri, [...currentDiags, ...newDiags]);
    }

    private setDiagnosticsForFile(uri: vscode.Uri, diags: CodeAnalyzerDiagnostic[]): void {
        this.diagnosticCollection.set(uri, diags);
    }
}


export function toRange(codeLocation: CodeLocation): vscode.Range {
    // If there's no explicit startLine, just use the first line.
    const startLine: number = codeLocation.startLine != null ? adjustToZeroBased(codeLocation.startLine) : 0;
    // If there's no explicit startColumn, just use the first column.
    const startColumn: number = codeLocation.startColumn != null ? adjustToZeroBased(codeLocation.startColumn) : 0;
    // If there's no explicit end line, just use the start line.
    const endLine: number = codeLocation.endLine != null ? adjustToZeroBased(codeLocation.endLine) : startLine;
    // If there's no explicit end column, just highlight everything through the end of the line (by just using a really large number).
    const endColumn = codeLocation.endColumn != null ? adjustToZeroBased(codeLocation.endColumn) : Number.MAX_SAFE_INTEGER;
    return new vscode.Range(startLine, startColumn, endLine, endColumn);
}

function groupByUri(diags: CodeAnalyzerDiagnostic[]): Map<vscode.Uri, CodeAnalyzerDiagnostic[]> {
    // Using fsPath as keys instead of uri in the initial sorting because two Uri instances can have the same fsPath but
    // be treated as two different keys because maps check keys by reference instead of by value.
    const filesToDiags: Map<string, CodeAnalyzerDiagnostic[]> = new Map<string, CodeAnalyzerDiagnostic[]>();
    for (const diag of diags) {
        const key = diag.uri.fsPath;
        if (!filesToDiags.has(key)) {
            filesToDiags.set(key, []);
        }
        filesToDiags.get(key).push(diag);
    }
    // Convert keys back to Uri instances
    return new Map([...filesToDiags].map(([fsPath, value]) => [vscode.Uri.file(fsPath), value]));
}

function adjustToZeroBased(value: number): number {
    // VSCode Positions are 0-indexed, so we need to subtract 1 from the violation's position information.
    // If a value has gone rogue (which hopefully should never happen), then we should just blank it out with a 0.
    return value <= 0 ? 0 : value - 1;
}


/**
 * Algorithm to adjust a diagnostic's range (or discard it by return null) based on the text document change event.
 * This algorithm needs to be very fast since it literally runs on every stroke of a key within the editor window.
 */
function adjustDiagnosticToChange(diag: CodeAnalyzerDiagnostic, change: vscode.TextDocumentContentChangeEvent,
                                  replacementLines: string[]): CodeAnalyzerDiagnostic | null {
    // Key: .  single line (i.e. no '\n' characters)
    //      _  multiple lines (i.e. at least one '\n' character)
    //      *  line that could be single or multiple (may or may not contain at least one '\n' character)
    //      {  start of change range
    //      }  end of change range
    //      [  start of diagnostic range
    //      ]  end of diagnostic range

    // Cases: [*]*{*}
    // If the change is after the diagnostic, then no updates needed
    if (change.range.start.isAfterOrEqual(diag.range.end)) {
        return diag;
    }

    // Calculate the change in the number of lines
    const numLinesInChangeRange: number = change.range.end.line - change.range.start.line + 1;
    const numLinesDiff: number = replacementLines.length - numLinesInChangeRange;

    // Initialize the results
    let newStartLine: number = diag.range.start.line;
    let newStartChar: number = diag.range.start.character;
    let newEndLine: number = diag.range.end.line;
    let newEndChar: number = diag.range.end.character;

    // Cases: {*}*[*]
    // If the change is before the diagnostic, then we just need to increase the diagnostic lines
    if (change.range.end.isBeforeOrEqual(diag.range.start)) {
        newStartLine = diag.range.start.line + numLinesDiff;
        newEndLine = diag.range.end.line + numLinesDiff;

        // Cases: {*}.[*]
        // If the preceding change is on the same line as the diagnostic, then adjust the characters as well
        if (change.range.end.line === diag.range.start.line) {
            const leftPos: number = replacementLines.length > 1 ? 0 : change.range.start.character;
            const origLen: number = diag.range.start.character - change.range.end.character;
            const lastLineLen: number = replacementLines[replacementLines.length-1].length;
            newStartChar = leftPos + origLen + lastLineLen;

            // Cases: {*}.[.]
            if (diag.range.isSingleLine) {
                newEndChar = newStartChar + (diag.range.end.character - diag.range.start.character);
            }
        }
        diag.range = new vscode.Range(newStartLine, newStartChar, newEndLine, newEndChar);
        return diag;
    }

    // Case: {*[*]*}
    // If the entire diagnostic is contained within the change, then we can just remove the diagnostic
    if(change.range.start.isBeforeOrEqual(diag.range.start) && change.range.end.isAfterOrEqual(diag.range.end)) {
        return null; // Using null to mark for removal
    }

    // Cases: [*{*]*} or {*[*}*]
    // At this point, there must be some sort of overlap of the diagnostic range with the change, so mark it stale:
    diag.markStale();

    // Cases: [*{*]*}
    // If the change continues past the diagnostic, then we shorten the diagnostic from the right and return
    if (change.range.end.isAfterOrEqual(diag.range.end)) {
        newEndLine = change.range.start.line;
        newEndChar = change.range.start.character;
        diag.range = new vscode.Range(newStartLine, newStartChar, newEndLine, newEndChar);
        return diag;
    }

    // Cases: {*[*}*] or [*{*}*]
    // If the change range's end is within the diagnostic, then we can safely grow or shrink the end line
    newEndLine = diag.range.end.line + numLinesDiff;

    // Cases: {*[*}.] or [*{*}.]
    // ... and if the diagnostic ends on the same line that the change ends then we need to adjust the end char as well
    if (change.range.end.line === diag.range.end.line) {
        const leftPos: number = replacementLines.length > 1 ? 0 : change.range.start.character;
        const origLen: number = change.range.isSingleLine ?
            diag.range.end.character - change.range.start.character :
            diag.range.end.character;
        const removalLen: number = change.range.isSingleLine ?
            change.range.end.character - change.range.start.character :
            change.range.end.character;
        const lastLineLen: number = replacementLines[replacementLines.length-1].length;
        newEndChar = leftPos + origLen - removalLen + lastLineLen;
    }

    // Cases: {*[*}*]
    // And if the change starts before the diagnostic starts, we must shorten the diagnostic from the left
    if(change.range.start.isBeforeOrEqual(diag.range.start)) {
        newStartLine = change.range.start.line + replacementLines.length - 1;
        if (replacementLines.length === 1) {
            newStartChar = change.range.start.character + replacementLines[0].length;
        } else {
            newStartChar = replacementLines[replacementLines.length - 1].length;
        }
    }

    diag.range = new vscode.Range(newStartLine, newStartChar, newEndLine, newEndChar);
    return diag;
}
