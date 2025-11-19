/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from "vscode";
import {CodeAnalyzerDiagnostic, DiagnosticManager, DiagnosticManagerImpl, Violation} from "../../src/lib/diagnostics";
import {FakeDiagnosticCollection} from "../vscode-stubs";

describe('DiagnosticManager.clearDiagnosticsInRangeByRule', () => {
    let diagnosticManager: DiagnosticManager;
    let diagnosticCollection: FakeDiagnosticCollection;
    const testUri: vscode.Uri = vscode.Uri.file('/test/file.cls');

    beforeEach(() => {
        diagnosticCollection = new FakeDiagnosticCollection();
        diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);
    });

    it('should clear only the specified rule diagnostics within the range', () => {
        // Create multiple diagnostics with different rules
        const diag1 = createDiagnostic(testUri, new vscode.Range(5, 0, 5, 10), 'pmd', 'EmptyCatchBlock');
        const diag2 = createDiagnostic(testUri, new vscode.Range(7, 0, 7, 10), 'pmd', 'ApexDoc');
        const diag3 = createDiagnostic(testUri, new vscode.Range(9, 0, 9, 10), 'pmd', 'EmptyCatchBlock');
        const diag4 = createDiagnostic(testUri, new vscode.Range(15, 0, 15, 10), 'pmd', 'ApexDoc');

        diagnosticManager.addDiagnostics([diag1, diag2, diag3, diag4]);

        // Define a class range from line 5 to line 10 (includes diag1, diag2, diag3 but not diag4)
        const classRange = new vscode.Range(5, 0, 10, 0);

        // Clear only 'EmptyCatchBlock' violations within the class range
        diagnosticManager.clearDiagnosticsInRangeByRule(testUri, classRange, 'pmd', 'EmptyCatchBlock');

        // Verify that:
        // - diag1 and diag3 (EmptyCatchBlock within range) are cleared
        // - diag2 (ApexDoc within range) is preserved
        // - diag4 (ApexDoc outside range) is preserved
        const remainingDiags = diagnosticManager.getDiagnosticsForFile(testUri);
        expect(remainingDiags).toHaveLength(2);
        expect(remainingDiags).toContain(diag2);
        expect(remainingDiags).toContain(diag4);
    });

    it('should not clear diagnostics outside the range', () => {
        const diag1 = createDiagnostic(testUri, new vscode.Range(2, 0, 2, 10), 'pmd', 'EmptyCatchBlock');
        const diag2 = createDiagnostic(testUri, new vscode.Range(5, 0, 5, 10), 'pmd', 'EmptyCatchBlock');
        const diag3 = createDiagnostic(testUri, new vscode.Range(12, 0, 12, 10), 'pmd', 'EmptyCatchBlock');

        diagnosticManager.addDiagnostics([diag1, diag2, diag3]);

        // Clear only within lines 5-10
        const classRange = new vscode.Range(5, 0, 10, 0);
        diagnosticManager.clearDiagnosticsInRangeByRule(testUri, classRange, 'pmd', 'EmptyCatchBlock');

        // diag1 (line 2) and diag3 (line 12) should be preserved
        const remainingDiags = diagnosticManager.getDiagnosticsForFile(testUri);
        expect(remainingDiags).toHaveLength(2);
        expect(remainingDiags).toContain(diag1);
        expect(remainingDiags).toContain(diag3);
    });

    it('should not clear diagnostics from different engines', () => {
        const pmdDiag = createDiagnostic(testUri, new vscode.Range(5, 0, 5, 10), 'pmd', 'EmptyCatchBlock');
        const eslintDiag = createDiagnostic(testUri, new vscode.Range(6, 0, 6, 10), 'eslint', 'EmptyCatchBlock');

        diagnosticManager.addDiagnostics([pmdDiag, eslintDiag]);

        const classRange = new vscode.Range(5, 0, 10, 0);
        diagnosticManager.clearDiagnosticsInRangeByRule(testUri, classRange, 'pmd', 'EmptyCatchBlock');

        // Only pmd diagnostic should be cleared, eslint should remain
        const remainingDiags = diagnosticManager.getDiagnosticsForFile(testUri);
        expect(remainingDiags).toHaveLength(1);
        expect(remainingDiags[0]).toBe(eslintDiag);
    });

    it('should handle multiple classes with same rule violations correctly', () => {
        // FirstClass diagnostics (lines 0-5)
        const firstClassDiag1 = createDiagnostic(testUri, new vscode.Range(1, 0, 1, 10), 'pmd', 'ApexDoc');
        const firstClassDiag2 = createDiagnostic(testUri, new vscode.Range(3, 0, 3, 10), 'pmd', 'ApexDoc');

        // SecondClass diagnostics (lines 7-12)
        const secondClassDiag1 = createDiagnostic(testUri, new vscode.Range(8, 0, 8, 10), 'pmd', 'ApexDoc');
        const secondClassDiag2 = createDiagnostic(testUri, new vscode.Range(10, 0, 10, 10), 'pmd', 'ApexDoc');

        diagnosticManager.addDiagnostics([firstClassDiag1, firstClassDiag2, secondClassDiag1, secondClassDiag2]);

        // Suppress ApexDoc only in SecondClass (lines 7-12)
        const secondClassRange = new vscode.Range(7, 0, 12, 0);
        diagnosticManager.clearDiagnosticsInRangeByRule(testUri, secondClassRange, 'pmd', 'ApexDoc');

        // FirstClass diagnostics should remain, SecondClass diagnostics should be cleared
        const remainingDiags = diagnosticManager.getDiagnosticsForFile(testUri);
        expect(remainingDiags).toHaveLength(2);
        expect(remainingDiags).toContain(firstClassDiag1);
        expect(remainingDiags).toContain(firstClassDiag2);
    });
});

function createDiagnostic(uri: vscode.Uri, range: vscode.Range, engine: string, rule: string): CodeAnalyzerDiagnostic {
    const violation: Violation = {
        rule: rule,
        message: `Test violation for ${rule}`,
        severity: 1,
        engine: engine,
        locations: [
            {
                file: uri.fsPath,
                startLine: range.start.line + 1,
                startColumn: range.start.character + 1,
                endLine: range.end.line + 1,
                endColumn: range.end.character + 1
            }
        ],
        primaryLocationIndex: 0,
        tags: [],
        resources: []
    };
    return CodeAnalyzerDiagnostic.fromViolation(violation);
}

