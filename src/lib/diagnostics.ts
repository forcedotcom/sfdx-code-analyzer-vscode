/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {messages} from './messages';
import * as vscode from 'vscode';

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

export type Violation = {
    rule: string;
    engine: string;
    message: string;
    severity: number;
    locations: CodeLocation[];
    primaryLocationIndex: number;
    resources: string[];
}

/**
 * Extended Diagnostic class to hold violation information and uri to make our life easier
 */
export class CodeAnalyzerDiagnostic extends vscode.Diagnostic {
    readonly violation: Violation;
    readonly uri: vscode.Uri;

    private constructor(violation: Violation) {
        const primaryLocation: CodeLocation = violation.locations[violation.primaryLocationIndex];
        super(toRange(primaryLocation),
            messages.diagnostics.messageGenerator(violation.severity, violation.message.trim()),
            vscode.DiagnosticSeverity.Warning); // TODO: For V5, we should consider using Error for sev 1 and Information for sev 5 instead of always just using Warning.
        this.violation = violation;
        this.uri = vscode.Uri.file(primaryLocation.file);
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

        // Some violation's have ranges that are too noisy, so for now we manually fix them here while we wait on:
        // - https://github.com/pmd/pmd/issues/5511 for 'ApexSharingViolations'
        // - https://github.com/pmd/pmd/issues/5614 for 'ApexDoc'
        // - https://github.com/pmd/pmd/issues/5616 for 'ExcessiveParameterList'
        if (['ApexDoc', 'ApexSharingViolations', 'ExcessiveParameterList'].includes(violation.rule)) {
            diagnostic.range = new vscode.Range(diagnostic.range.start.line, diagnostic.range.start.character,
                diagnostic.range.start.line, Number.MAX_SAFE_INTEGER);
        }

        diagnostic.source = messages.diagnostics.source.generator(violation.engine);
        diagnostic.code = violation.resources.length > 0 ? {
            target: vscode.Uri.parse(violation.resources[0]),
            value: violation.rule
        } : violation.rule;

        // For violations with multiple code locations, we should add in their locations as related information
        if (violation.locations.length > 1) {
            const relatedLocations: vscode.DiagnosticRelatedInformation[] = [];
            for (let i = 0 ; i < violation.locations.length; i++) {
                if (i !== violation.primaryLocationIndex) {
                    const relatedLocation = violation.locations[i];
                    const relatedRange = toRange(relatedLocation);
                    const vscodeLocation: vscode.Location = new vscode.Location(vscode.Uri.file(relatedLocation.file), relatedRange);
                    relatedLocations.push(new vscode.DiagnosticRelatedInformation(vscodeLocation, relatedLocation.comment));
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
    clearDiagnosticsInRange(uri: vscode.Uri, range: vscode.Range): void
    clearDiagnosticsForFiles(uris: vscode.Uri[]): void
}

export class DiagnosticManagerImpl implements DiagnosticManager {
    private readonly diagnosticCollection: vscode.DiagnosticCollection;

    public constructor(diagnosticCollection: vscode.DiagnosticCollection) {
        this.diagnosticCollection = diagnosticCollection;
    }

    public addDiagnostics(diags: CodeAnalyzerDiagnostic[]) {
        const uriToDiagsMap: Map<vscode.Uri, CodeAnalyzerDiagnostic[]> = groupByUri(diags);
        for (const [uri, diags] of uriToDiagsMap) {
            this.addDiagnosticsForUri(uri, diags);
        }
    }

    public clearAllDiagnostics(): void {
        this.diagnosticCollection.clear();
    }

    public clearDiagnostic(diagnostic: CodeAnalyzerDiagnostic): void {
        const uri: vscode.Uri = diagnostic.uri;
        const currentDiagnostics: readonly vscode.Diagnostic[] = this.getDiagnosticsForUri(uri);
        const updatedDiagnostics: vscode.Diagnostic[] = currentDiagnostics.filter(diag => diag !== diagnostic);
        this.setDiagnosticsForUri(uri, updatedDiagnostics);
    }

    public dispose(): void {
        this.clearAllDiagnostics();
    }

    clearDiagnosticsForFiles(uris: vscode.Uri[]): void {
        for (const uri of uris) {
            this.diagnosticCollection.delete(uri);
        }
    }

    public clearDiagnosticsInRange(uri: vscode.Uri, range: vscode.Range): void {
        const currentDiagnostics: readonly vscode.Diagnostic[] = this.getDiagnosticsForUri(uri);
        // Only keep the diagnostics that aren't within the specified range
        const updatedDiagnostics: vscode.Diagnostic[] = currentDiagnostics.filter(diagnostic => !range.contains(diagnostic.range));
        this.setDiagnosticsForUri(uri, updatedDiagnostics);
    }

    private addDiagnosticsForUri(uri: vscode.Uri, newDiags: vscode.Diagnostic[]): void {
        const currentDiags: readonly vscode.Diagnostic[] = this.getDiagnosticsForUri(uri);
        this.setDiagnosticsForUri(uri, [...currentDiags, ...newDiags]);
    }

    private getDiagnosticsForUri(uri: vscode.Uri): readonly vscode.Diagnostic[] {
        return this.diagnosticCollection.get(uri) || [];
    }

    private setDiagnosticsForUri(uri: vscode.Uri, diags: vscode.Diagnostic[]): void {
        this.diagnosticCollection.set(uri, diags);
    }
}


function toRange(codeLocation: CodeLocation): vscode.Range {
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
