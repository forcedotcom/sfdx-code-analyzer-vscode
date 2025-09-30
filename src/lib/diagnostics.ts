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
                    relatedLocations.push(new vscode.DiagnosticRelatedInformation(vscodeLocation, relatedLocation.comment ?? 
                        messages.diagnostics.defaultAlternativeLocationMessage
                    ));
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

            // Calculating this once and pass it in instead of redoing it for each of the diagnostics
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

export function normalizeViolation(violation: Violation, lineLengthsForPrimaryFile?: number[]): Violation {
    const primaryFile: string = violation.locations[violation.primaryLocationIndex].file;

    for (let i: number = 0; i < violation.locations.length; i++) {
        if (violation.locations[i].file === primaryFile) {
            normalizeLocation(violation.locations[i], lineLengthsForPrimaryFile);
        }
    }

    for (let i: number = 0; i < violation.fixes?.length; i++) {
        if (violation.fixes[i].location.file === primaryFile) {
            normalizeLocation(violation.fixes[i].location, lineLengthsForPrimaryFile);
        }
    }

    for (let i: number = 0; i < violation.suggestions?.length; i++) {
        if (violation.suggestions[i].location.file === primaryFile) {
            normalizeLocation(violation.suggestions[i].location, lineLengthsForPrimaryFile);
        }
    }

    return violation;
}

function normalizeLocation(location: CodeLocation, lineLengths?: number[]): CodeLocation {
    location.startLine = location.startLine ?? 1;
    location.startColumn = location.startColumn ?? 1;
    location.endLine = location.endLine ?? location.startLine;
    location.endColumn = location.endColumn ?? (lineLengths ? (lineLengths[location.endLine-1] + 1) : Number.MAX_SAFE_INTEGER);
    return location;
}

export function toRange(codeLocation: CodeLocation): vscode.Range {
    normalizeLocation(codeLocation);
    return new vscode.Range(
        adjustToZeroBased(codeLocation.startLine),
        adjustToZeroBased(codeLocation.startColumn),
        adjustToZeroBased(codeLocation.endLine),
        adjustToZeroBased(codeLocation.endColumn));
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


function adjustDiagnosticToChange(diag: CodeAnalyzerDiagnostic, change: vscode.TextDocumentContentChangeEvent,
                                  replacementLines: string[]): CodeAnalyzerDiagnostic | null {

    const violationAdjustment: Adjustment<Violation> = adjustViolationToChange(diag.violation, change, replacementLines);
    if (violationAdjustment.newValue === null) {
        return null; // Do not add back a diagnostic if its violation has been marked for removal
    }
    const newDiag: CodeAnalyzerDiagnostic = CodeAnalyzerDiagnostic.fromViolation(diag.violation);

    if (violationAdjustment.overlapsWithChange || diag.isStale()) {
        diag.markStale(); // Not really needed, but added for safety just in case somehow the old diagnostic doesn't properly get thrown away.
        newDiag.markStale();
    }

    return newDiag;
}

function adjustViolationToChange(oldViolation: Violation, change: vscode.TextDocumentContentChangeEvent,
                                 replacementLines: string[]): Adjustment<Violation> {
    const primaryLocation: CodeLocation = oldViolation.locations[oldViolation.primaryLocationIndex];
    let hasPrimaryLocationOverlap: boolean = false;
    const newViolation: Violation = oldViolation;

    // Update violation locations
    const newViolationLocations: CodeLocation[] = [];
    for (let i: number = 0; i < oldViolation.locations.length; i++) {
        const origLocation = oldViolation.locations[i];
        // Other locations not associated with this file (for the primary location) shouldn't be updated
        if (origLocation.file !== primaryLocation.file) {
            newViolationLocations.push(origLocation);
            continue;
        }

        const locationAdjustment: Adjustment<CodeLocation> = adjustLocationToChange(origLocation, change, replacementLines);
        if (i === oldViolation.primaryLocationIndex) {
            hasPrimaryLocationOverlap = locationAdjustment.overlapsWithChange;
        }

        if (locationAdjustment.newValue !== null) {
            newViolationLocations.push(locationAdjustment.newValue);
        } else if (i === oldViolation.primaryLocationIndex) {
            return { newValue: null, overlapsWithChange: locationAdjustment.overlapsWithChange }; // Indicates that the violation should be removed
        } else if (i < oldViolation.primaryLocationIndex) {
            newViolation.primaryLocationIndex--; // Edge case: need to adjust primary index if deleting a location prior to the primary
        }
    }
    newViolation.locations = newViolationLocations;


    // update fix locations
    newViolation.fixes = oldViolation.fixes?.map(fix => {
        if (fix.location.file !== primaryLocation.file) {
            return fix;
        }
        const locationAdjustment: Adjustment<CodeLocation> = adjustLocationToChange(fix.location, change, replacementLines);
        return locationAdjustment.newValue === null || locationAdjustment.overlapsWithChange ?
            null : {...fix, location: locationAdjustment.newValue};
    }).filter(fix => fix !== null);


    // update suggestion locations
    newViolation.suggestions = oldViolation.suggestions?.map(suggestion => {
        if (suggestion.location.file !== primaryLocation.file) {
            return suggestion;
        }
        const locationAdjustment: Adjustment<CodeLocation> = adjustLocationToChange(suggestion.location, change, replacementLines);
        return locationAdjustment.newValue === null || locationAdjustment.overlapsWithChange ? 
            null : {...suggestion, location: locationAdjustment.newValue};
    }).filter(suggestion => suggestion !== null);

    return { newValue: newViolation, overlapsWithChange: hasPrimaryLocationOverlap };
}

function adjustLocationToChange(origLocation: CodeLocation, change: vscode.TextDocumentContentChangeEvent,
                                    replacementLines: string[]): Adjustment<CodeLocation> {
    const origRange: vscode.Range = toRange(origLocation);
    const rangeAdjustment: Adjustment<vscode.Range> = adjustRangeToChange(origRange, change, replacementLines);
    if (rangeAdjustment.newValue === null) {
        return { newValue: null, overlapsWithChange: rangeAdjustment.overlapsWithChange };
    }
    return {
        newValue: {
            file: origLocation.file,
            comment: origLocation.comment,
            startLine: rangeAdjustment.newValue.start.line + 1,
            startColumn: rangeAdjustment.newValue.start.character + 1,
            endLine: rangeAdjustment.newValue.end.line + 1,
            endColumn: rangeAdjustment.newValue.end.character >= Number.MAX_SAFE_INTEGER ? 
                undefined : rangeAdjustment.newValue.end.character + 1
        },
        overlapsWithChange: rangeAdjustment.overlapsWithChange
    }
}

/**
 * Algorithm to adjust a range (or discard it by return null) based on the text document change event.
 * This algorithm needs to be very fast since it literally runs on every stroke of a key within the editor window.
 */
function adjustRangeToChange(origRange: vscode.Range, change: vscode.TextDocumentContentChangeEvent,
                             replacementLines: string[]): Adjustment<vscode.Range> {
    // Key: .  single line (i.e. no '\n' characters)
    //      _  multiple lines (i.e. at least one '\n' character)
    //      *  line that could be single or multiple (may or may not contain at least one '\n' character)
    //      {  start of change range
    //      }  end of change range
    //      [  start of original range
    //      ]  end of original range

    // Cases: [*]*{*}
    // If the change is after the original range, then no updates needed
    if (change.range.start.isAfterOrEqual(origRange.end)) {
        return { newValue: origRange, overlapsWithChange: false };
    }

    // Calculate the change in the number of lines
    const numLinesInChangeRange: number = change.range.end.line - change.range.start.line + 1;
    const numLinesDiff: number = replacementLines.length - numLinesInChangeRange;

    // Initialize the results
    let newStartLine: number = origRange.start.line;
    let newStartChar: number = origRange.start.character;
    let newEndLine: number = origRange.end.line;
    let newEndChar: number = origRange.end.character;

    // Cases: {*}*[*]
    // If the change is before the original range, then we just need to increase the range lines
    if (change.range.end.isBeforeOrEqual(origRange.start)) {
        newStartLine = origRange.start.line + numLinesDiff;
        newEndLine = origRange.end.line + numLinesDiff;

        // Cases: {*}.[*]
        // If the preceding change is on the same line as the original range, then adjust the characters as well
        if (change.range.end.line === origRange.start.line) {
            const leftPos: number = replacementLines.length > 1 ? 0 : change.range.start.character;
            const origLen: number = origRange.start.character - change.range.end.character;
            const lastLineLen: number = replacementLines[replacementLines.length-1].length;
            newStartChar = leftPos + origLen + lastLineLen;

            // Cases: {*}.[.]
            if (origRange.isSingleLine) {
                newEndChar = newStartChar + (origRange.end.character - origRange.start.character);
            }
        }
        return { newValue: new vscode.Range(newStartLine, newStartChar, newEndLine, newEndChar), overlapsWithChange: false };
    }

    // At this point, there must be some sort of overlap of the original range with the change, so we set overlapsWithChange to true

    // Case: {*[*]*}
    // If the entire original range is contained within the change, then we can just mark the range to be removed
    if(change.range.start.isBeforeOrEqual(origRange.start) && change.range.end.isAfterOrEqual(origRange.end)) {
        return { newValue: null, overlapsWithChange: true }; // Using null to mark for removal
    }

    // Cases: [*{*]*}
    // If the change continues past the original range, then we shorten the range from the right and return
    if (change.range.end.isAfterOrEqual(origRange.end)) {
        newEndLine = change.range.start.line;
        newEndChar = change.range.start.character;
        return { newValue: new vscode.Range(newStartLine, newStartChar, newEndLine, newEndChar), overlapsWithChange: true };
    }

    // Cases: {*[*}*] or [*{*}*]
    // If the change range's end is within the original range, then we can safely grow or shrink the end line
    newEndLine = origRange.end.line + numLinesDiff;

    // Cases: {*[*}.] or [*{*}.]
    // ... and if the original range ends on the same line that the change ends then we need to adjust the end char as well
    if (change.range.end.line === origRange.end.line) {
        const leftPos: number = replacementLines.length > 1 ? 0 : change.range.start.character;
        const origLen: number = change.range.isSingleLine ?
            origRange.end.character - change.range.start.character :
            origRange.end.character;
        const removalLen: number = change.range.isSingleLine ?
            change.range.end.character - change.range.start.character :
            change.range.end.character;
        const lastLineLen: number = replacementLines[replacementLines.length-1].length;
        newEndChar = leftPos + origLen - removalLen + lastLineLen;
    }

    // Cases: {*[*}*]
    // And if the change starts before the original range starts, we must shorten the range from the left
    if(change.range.start.isBeforeOrEqual(origRange.start)) {
        newStartLine = change.range.start.line + replacementLines.length - 1;
        if (replacementLines.length === 1) {
            newStartChar = change.range.start.character + replacementLines[0].length;
        } else {
            newStartChar = replacementLines[replacementLines.length - 1].length;
        }
    }

    return { newValue: new vscode.Range(newStartLine, newStartChar, newEndLine, newEndChar), overlapsWithChange: true };
}

class Adjustment<T> {
    newValue: T | null; // null is a way of marking that there is no new value and thus the old should be removed
    overlapsWithChange: boolean; 
}