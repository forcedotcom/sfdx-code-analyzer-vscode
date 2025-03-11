/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {messages} from './messages';
import * as vscode from 'vscode';
import {Logger} from "./logger";
import {TelemetryService} from "./external-services/telemetry-service";
import * as targeting from './targeting';
import * as Constants from './constants'

type DiagnosticConvertibleLocation = {
    file: string;
    startLine: number;
    startColumn: number;
    endLine?: number;
    endColumn?: number;
    comment?: string;
}

export type DiagnosticConvertible = {
    rule: string;
    engine: string;
    message: string;
    severity: number;
    locations: DiagnosticConvertibleLocation[];
    primaryLocationIndex: number;
    resources: string[];
    currentCode?: string;
    suggestedCode?: string;
}

export interface DiagnosticManager extends vscode.Disposable {
    clearAllDiagnostics(): void
    clearDiagnostic(uri: vscode.Uri, diag: vscode.Diagnostic);
    clearDiagnosticsInRange(uri: vscode.Uri, range: vscode.Range): void
    clearDiagnosticsForSelectedFiles(selections: vscode.Uri[], commandName: string): Promise<void>
    displayAsDiagnostics(allTargets: string[], convertibles: DiagnosticConvertible[]): void
}

export class DiagnosticManagerImpl implements DiagnosticManager {
    private readonly diagnosticCollection: vscode.DiagnosticCollection;
    private readonly telemetryService: TelemetryService;
    private readonly logger: Logger;

    public constructor(diagnosticCollection: vscode.DiagnosticCollection, telemetryService: TelemetryService, logger: Logger) {
        this.diagnosticCollection = diagnosticCollection;
        this.telemetryService = telemetryService;
        this.logger = logger;
    }

    public clearAllDiagnostics(): void {
        this.diagnosticCollection.clear();
    }

    public clearDiagnostic(uri: vscode.Uri, diagnostic: vscode.Diagnostic): void {
        const currentDiagnostics: readonly vscode.Diagnostic[] = this.diagnosticCollection.get(uri) || [];
        const updatedDiagnostics: vscode.Diagnostic[] = currentDiagnostics.filter(diag => diag !== diagnostic);
        this.diagnosticCollection.set(uri, updatedDiagnostics);
    }

    public dispose(): void {
        this.clearAllDiagnostics();
    }

    /**
     * Clear diagnostics for a specific files
     */
    async clearDiagnosticsForSelectedFiles(selections: vscode.Uri[], commandName: string): Promise<void> {
        const startTime = Date.now();

        try {
            const targets: string[] = await targeting.getTargets(selections);

            for (const target of targets) {
                this.diagnosticCollection.delete(vscode.Uri.file(target));
            }

            // TODO: It doesn't make sense that we are performing telemetry here in my opinion. This should be
            //        moved to an associated action.
            this.telemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_STATIC_ANALYSIS, {
                executedCommand: commandName,
                duration: (Date.now() - startTime).toString()
            });
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : e as string;
            this.telemetryService.sendException(Constants.TELEM_FAILED_STATIC_ANALYSIS, errMsg, {
                executedCommand: commandName,
                duration: (Date.now() - startTime).toString()
            });
            this.logger.error(errMsg);
        }
    }

    /**
     *
     * @param allTargets The names of EVERY file targeted by a particular scan
     * @param convertibles DiagnosticConvertibles created as a result of a scan
     */
    public displayAsDiagnostics(allTargets: string[], convertibles: DiagnosticConvertible[]): void {
        const convertiblesByTarget: Map<string, DiagnosticConvertible[]> = this.mapConvertiblesByTarget(convertibles);

        for (const target of allTargets) {
            const targetUri = vscode.Uri.file(target);
            const convertiblesForTarget: DiagnosticConvertible[] = convertiblesByTarget.get(target) || [];
            this.diagnosticCollection.set(targetUri, convertiblesForTarget.map((c) => this.convertToDiagnostic(c)));
        }
    }

    public clearDiagnosticsInRange(uri: vscode.Uri, range: vscode.Range): void {
        const currentDiagnostics: readonly vscode.Diagnostic[] = this.diagnosticCollection.get(uri) || [];
        // Only keep the diagnostics that aren't within the specified range
        const updatedDiagnostics: vscode.Diagnostic[] = currentDiagnostics.filter(diagnostic => !range.contains(diagnostic.range));
        this.diagnosticCollection.set(uri, updatedDiagnostics);
    }

    private mapConvertiblesByTarget(convertibles: DiagnosticConvertible[]): Map<string, DiagnosticConvertible[]> {
        const convertibleMap: Map<string, DiagnosticConvertible[]> = new Map();
        for (const convertible of convertibles) {
            const primaryLocation: DiagnosticConvertibleLocation = convertible.locations[convertible.primaryLocationIndex];
            const primaryFile: string = primaryLocation.file;
            const convertiblesMappedToPrimaryFile: DiagnosticConvertible[] = convertibleMap.get(primaryFile) || [];
            convertibleMap.set(primaryFile, [...convertiblesMappedToPrimaryFile, convertible]);
        }
        return convertibleMap;
    }

    private convertToDiagnostic(convertible: DiagnosticConvertible): vscode.Diagnostic {
        const primaryLocation: DiagnosticConvertibleLocation = convertible.locations[convertible.primaryLocationIndex];
        let primaryLocationRange: vscode.Range;
        // This is an interim fix to handle ApexSharingViolations and can be removed once PMD fixes PMD fixes the bug: https://github.com/pmd/pmd/issues/5511
        if (convertible.rule === 'ApexSharingViolations' && primaryLocation.endLine && primaryLocation.endLine !== primaryLocation.startLine) {
            primaryLocationRange = this.convertToRangeForApexSharingViolations(primaryLocation);
        } else {
            primaryLocationRange = this.convertToRange(primaryLocation);
        }

        const diagnostic: vscode.Diagnostic = new vscode.Diagnostic(
            primaryLocationRange,
            messages.diagnostics.messageGenerator(convertible.severity, convertible.message.trim()),
            vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = messages.diagnostics.source.generator(convertible.engine);
        diagnostic.code = convertible.resources.length > 0 ? {
            target: vscode.Uri.parse(convertible.resources[0]),
            value: convertible.rule
        } : convertible.rule;

        // TODO: If possible, convert this engine-specific handling to something more generalized.
        if (convertible.engine === 'apexguru') {
            if (convertible.suggestedCode) {
                diagnostic.relatedInformation = [
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(vscode.Uri.parse(convertible.resources[0]), primaryLocationRange),
                        `\n// Current Code: \n${convertible.currentCode}`
                    ),
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(vscode.Uri.parse(convertible.resources[0]), primaryLocationRange),
                        `/*\n//ApexGuru Suggestions: \n${convertible.suggestedCode}\n*/`
                    )
                ]
            }
        }

        if (convertible.locations.length > 1) {
            const relatedLocations: vscode.DiagnosticRelatedInformation[] = [];
            for (let i = 0 ; i < convertible.locations.length; i++) {
                if (i !== convertible.primaryLocationIndex) {
                    const relatedLocation = convertible.locations[i];
                    const relatedRange = this.convertToRange(relatedLocation);
                    const vscodeLocation: vscode.Location = new vscode.Location(vscode.Uri.file(relatedLocation.file), relatedRange);
                    relatedLocations.push(new vscode.DiagnosticRelatedInformation(vscodeLocation, relatedLocation.comment));
                }
            }
            diagnostic.relatedInformation = relatedLocations;
        }
        return diagnostic;
    }

    private convertToRange(locationConvertible: DiagnosticConvertibleLocation): vscode.Range {
        // VSCode Positions are 0-indexed, so we need to subtract 1 from the violation's position information.
        // However, in certain cases, a violation's location might be line/column 0 of a file, and we can't use negative
        // numbers here. So don't let ourselves go below 0.
        const startLine = Math.max(locationConvertible.startLine - 1, 0);
        const startColumn = Math.max(locationConvertible.startColumn - 1, 0);
        // If there's no explicit end line, just use the start line.
        const endLine = locationConvertible.endLine != null ? locationConvertible.endLine - 1 : startLine;
        // If there's no explicit end column, just highlight everything through the end of the line.
        const endColumn = locationConvertible.endColumn != null ? locationConvertible.endColumn - 1 : Number.MAX_SAFE_INTEGER;

        const startPosition: vscode.Position = new vscode.Position(startLine, startColumn);
        const endPosition: vscode.Position = new vscode.Position(endLine, endColumn);

        return new vscode.Range(startPosition, endPosition);
    }

    // As discussed above, this is an interim solution and this method will be removed once
    // PMD fixes the bug: https://github.com/pmd/pmd/issues/5511
    private convertToRangeForApexSharingViolations({ startLine, startColumn }: DiagnosticConvertibleLocation): vscode.Range {
        const start = new vscode.Position(Math.max(startLine - 1, 0), Math.max(startColumn - 1, 0));
        const end = new vscode.Position(start.line, Number.MAX_SAFE_INTEGER);

        return new vscode.Range(start, end);
    }
}

export function extractRuleName(diagnostic: vscode.Diagnostic): string {
    return typeof diagnostic.code === 'object' && 'value' in diagnostic.code ? diagnostic.code.value.toString() :
        typeof diagnostic.code === 'string' ? diagnostic.code : '';
}
