/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { ApexGuruViolation, PathlessRuleViolation, RuleResult, RuleViolation } from '../types';
import {messages} from './messages';
import * as vscode from 'vscode';

/**
 * Class that handles the creation, display, and removal of {@link vscode.Diagnostic}s.
 */
export class DiagnosticManager {

    /**
     *
     * @param {string[]} targets The names of ALL files targeted by a particular scan.
     * @param {RuleResult[]} results The results of the scan.
     * @param {vscode.DiagnosticCollection} diagnosticCollection The diagnostic collection to which new diagnostics should be added.
     */
    public displayDiagnostics(targets: string[], results: RuleResult[], diagnosticCollection: vscode.DiagnosticCollection): void {
        const diagnosticsMap: Map<string, vscode.Diagnostic[]> = this.createDiagnosticsMap(results);
        for (const target of targets) {
            const uri = vscode.Uri.file(target);
            diagnosticCollection.set(uri, diagnosticsMap.get(target) || []);
        }
    }

    /**
     * Turns the results of a Salesforce Code Analyzer execution into displayable {@link vscode.Diagnostic}s.
     * @param {RuleResult[]} results An array of results returned by a Salesforce Code Analyzer execution
     * @returns {Map<string, vscode.Diagnostic[]} A mapping from file names to the diagnostics created for those files
     */
    private createDiagnosticsMap(results: RuleResult[]): Map<string,vscode.Diagnostic[]> {
        const diagnosticsMap: Map<string, vscode.Diagnostic[]> = new Map();
        for (const result of results) {
            const {
                engine, fileName, violations
            } = result;
            let diagnostics: vscode.Diagnostic[] = diagnosticsMap.get(fileName) || [];
            for (const violation of violations) {

                diagnostics = [...diagnostics, this.createDiagnostic(engine, violation)];
            }
            diagnosticsMap.set(fileName, diagnostics);
        }
        return diagnosticsMap;
    }

    // TODO: Enhance to support both pathless and DFA violations.
    /**
     * @param {string} engine The name of an engine run by Salesforce Code Analyzer
     * @param {RuleViolation} violation A violation thrown by the specified engine
     * @returns A {@link vscode.Diagnostic} representing the violation
     * @throws When provided a {@link DfaRuleViolation}, as this is not yet supported
     */
    private createDiagnostic(engine: string, violation: RuleViolation): vscode.Diagnostic {
        // If the violation isn't pathless, throw an error.
        // This should never happen in the wild, but best to validate our assumptions.
        if (!this.isPathlessViolation(violation)) {
            // Hardcoding this message should be fine, because it should only ever
            // appear in response to developer error, not user error.
            throw new Error('Diagnostics cannot be created from DFA violations');
        }

        // Handle case where line or column is 0 by setting them to a default value (1-based index).
        const line = violation.line > 0 ? violation.line : 1;
        const column = violation.column > 0 ? violation.column : 1;

        // We always have the information we need to create the starting position.
        const startPosition: vscode.Position = new vscode.Position(line - 1, column - 1);
        // We may or may not have the information for an end position.
        const endPosition: vscode.Position = new vscode.Position(
            // If we're missing an explicit end line, use the starting line.
            (violation.endLine || line) - 1,
            // If we're missing an explicit end column, just highlight everything through the end of the line.
            violation.endColumn || Number.MAX_SAFE_INTEGER
        );

        const range: vscode.Range = new vscode.Range(startPosition, endPosition);
        const diagnostic: vscode.Diagnostic = new vscode.Diagnostic(
            range,
            messages.diagnostics.messageGenerator(violation.severity, violation.message.trim()),
            vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = messages.diagnostics.source.generator(engine);
        diagnostic.code = violation.url ? {
            target: vscode.Uri.parse(violation.url),
            value: violation.ruleName
        } : violation.ruleName;
        if (engine === 'apexguru') {
            const apexGuruViolation = violation as ApexGuruViolation;
        
            if (apexGuruViolation.suggestedCode !== undefined) {
                diagnostic.relatedInformation = [
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(vscode.Uri.parse('Current Code'), range),
                        `${apexGuruViolation.currentCode}`
                    ),
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(vscode.Uri.parse('ApexGuru Suggestions'), range),
                        `${apexGuruViolation.suggestedCode}`
                    )
                ];
            }

        }
        return diagnostic;
    }

    /**
     * Type-guard for {@link PathlessRuleViolation}s.
     * @param violation A violation that may or may not be a {@link PathlessRuleViolation}.
     * @returns
     */
    private isPathlessViolation(violation: RuleViolation): violation is PathlessRuleViolation {
        return 'line' in violation;
    }
}
