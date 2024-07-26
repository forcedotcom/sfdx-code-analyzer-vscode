/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';
import {expect} from 'chai';
import path = require('path');
import {DiagnosticManager} from '../../lib/diagnostics';
import {DfaRuleViolation, PathlessRuleViolation, RuleResult} from '../../types';

suite('diagnostics.ts', () => {
    suite('#displayDiagnostics()', () => {
        // Note: __dirname is used here because it's consistent across file systems.
        const codeFixturesPath: string = path.resolve(__dirname, '..', '..', '..', 'code-fixtures');
        const pathToFirstFile: string = path.join(codeFixturesPath, 'folder-a', 'MyClassA1.cls');
        const firstFileResults: RuleResult = {
            engine: "pmd",
            fileName: pathToFirstFile,
            violations: [{
                ruleName: 'fakeRule1',
                message: 'fakeMessage',
                severity: 1,
                category: 'fake category',
                line: 11,
                column: 2
            }]
        };
        const pathToSecondFile: string = path.join(codeFixturesPath, 'folder-a', 'MyClassA2.cls');
        const secondFileResults: RuleResult = {
            engine: "pmd",
            fileName: pathToSecondFile,
            violations: [{
                ruleName: 'fakeRule1',
                message: 'fakeMessage',
                severity: 1,
                category: 'fake category',
                line: 19,
                column: 2
            }, {
                ruleName: 'fakeRule2',
                message: 'fakeMessage',
                severity: 1,
                category: 'fake category',
                line: 3,
                column: 15
            }]
        };

		// Note: We want to share the same diagnostic collection across tests.
		let diagnosticCollection: vscode.DiagnosticCollection = null;

		setup(() => {
			// Re-initialize the collection before each test.
			diagnosticCollection = vscode.languages.createDiagnosticCollection('sfca.diagnosticTest');
		});

		teardown(() => {
			// Clear the collection after each test.
			diagnosticCollection.clear();
		});

        test('Adds violations to first-time target', () => {
            // ===== SETUP =====
            // Create a diagnostic manager.
            const diagnosticManager = new DiagnosticManager();

            // ===== TEST =====
            // Simulate a run against target 1 that returned some results.
            diagnosticManager.displayDiagnostics([pathToFirstFile], [firstFileResults], diagnosticCollection);

            // ===== ASSERTIONS =====
            // Validate that the file now has one violation.
            expect(diagnosticCollection.get(vscode.Uri.file(pathToFirstFile))).to.have.lengthOf(1, 'Wrong number of diagnostics');
        });

        test('Refreshes stale violations on second-time target', () => {
            // ===== SETUP =====
            // Seed the diagnostic collection with a diagnostic in file 2.
            const secondFileUri = vscode.Uri.file(pathToSecondFile);
            diagnosticCollection.set(secondFileUri, [
                new vscode.Diagnostic(
                    new vscode.Range(new vscode.Position(1, 2), new vscode.Position(2, 3)),
                    "this message matters not"
                )
            ]);

            // Create a manager.
            const diagnosticManager = new DiagnosticManager();

            // ===== TEST =====
            // Simulate a run against file 2 that returned different results than were already present.
            diagnosticManager.displayDiagnostics([pathToSecondFile], [secondFileResults], diagnosticCollection);

            // ===== ASSERTIONS =====
            // Verify that the file now has two violations.
            expect(diagnosticCollection.get(secondFileUri)).to.have.lengthOf(2, 'Wrong number of results');
        });

        test('Clears resolved violations on second-time target', () => {
            // ===== SETUP =====
            // Seed the diagnostic collection with a diagnostic in file 2.
            const secondFileUri = vscode.Uri.file(pathToSecondFile);
            diagnosticCollection.set(secondFileUri, [
                new vscode.Diagnostic(
                    new vscode.Range(new vscode.Position(1, 2), new vscode.Position(2, 3)),
                    "this message matters not"
                )
            ]);

            // Create a manager.
            const diagnosticManager = new DiagnosticManager();

            // ===== TEST =====
            // Simulate a run against file 2 that returned no results.
            diagnosticManager.displayDiagnostics([pathToSecondFile], [], diagnosticCollection);

            // ===== ASSERTIONS =====
            // Verify that the file now has no violations.
            expect(diagnosticCollection.get(secondFileUri)).to.have.lengthOf(0, 'Wrong number of violations');
        });

        test('Ignores existing violations on non-targeted file', () => {
            // ===== SETUP =====
            // Seed the diagnostic collection with a diagnostic in file 2.
            const secondFileUri = vscode.Uri.file(pathToSecondFile);
            diagnosticCollection.set(secondFileUri, [
                new vscode.Diagnostic(
                    new vscode.Range(new vscode.Position(1, 2), new vscode.Position(2, 3)),
                    "this message matters not"
                )
            ]);
            // Create a manager.
            const diagnosticManager = new DiagnosticManager();

            // ===== TEST =====
            // Simulate a run against file 1 that returned results.
            diagnosticManager.displayDiagnostics([pathToFirstFile], [firstFileResults], diagnosticCollection);

            // ===== ASSERTIONS =====
            // Verify that the violations in file 2 are unchanged.
            expect(diagnosticCollection.get(secondFileUri)).to.have.lengthOf(1, 'Wrong number of results');
        });
    });

    suite('#createDiagnostic()', () => {
        suite('Pathless violations', () => {
            const baseSpoofedViolation: PathlessRuleViolation = {
                ruleName: 'fake rule',
                message: 'some message',
                severity: 1,
                category: 'Some category',
                line: 15,
                column: 7
            };

            // TODO: Perhaps wait on this test until the messages/source/code specifics are sorted out.
            test('Generates correct rule data', () => {
                // ===== SETUP =====
                // ===== TEST =====
                // ===== ASSERTIONS =====
            });

            test('Generates positioning from violation WITH endLine and endColumn', () => {
                // ===== SETUP =====
                // Create our diagnostic manager and a copy of the violation.
                const spoofedViolation: PathlessRuleViolation = JSON.parse(JSON.stringify(baseSpoofedViolation)) as PathlessRuleViolation;
                const diagnosticManager: DiagnosticManager = new DiagnosticManager();
                // Give the violation some end positioning.
                spoofedViolation.endLine = 30;
                spoofedViolation.endColumn = 23;

                // ===== TEST =====
                // Create a diagnostic using our fake violation.
                const diagnostic: vscode.Diagnostic = (diagnosticManager as any).createDiagnostic("pmd", spoofedViolation);

                // ===== ASSERTIONS =====
                // Verify that the starting and ending position both use the explicit values.
                // Bear in mind that start line, end line, and start column are all zero-indexed,
                // but the end column is not.
                const startingPosition: vscode.Position = diagnostic.range.start;
                const endingPosition: vscode.Position = diagnostic.range.end;
                expect(startingPosition.line).to.equal(spoofedViolation.line - 1, 'Wrong starting line');
                expect(startingPosition.character).to.equal(spoofedViolation.column - 1, 'Wrong starting column');
                expect(endingPosition.line).to.equal(spoofedViolation.endLine - 1, 'Wrong end line');
                expect(endingPosition.character).to.equal(spoofedViolation.endColumn, 'Wrong end column');
            });

            test('Generates positioning from violation WITHOUT endLine or endColumn', () => {
                // ===== SETUP =====
                // Create our diagnostic manager and a copy of the violation.
                const spoofedViolation: PathlessRuleViolation = JSON.parse(JSON.stringify(baseSpoofedViolation)) as PathlessRuleViolation;
                const diagnosticManager: DiagnosticManager = new DiagnosticManager();

                // ===== TEST =====
                // Create a diagnostic using our fake violation.
                const diagnostic: vscode.Diagnostic = (diagnosticManager as any).createDiagnostic("pmd", spoofedViolation);

                // ===== ASSERTIONS =====
                // Verify that the starting position uses the explicit value, and the end
                // position uses the end of the start line.
                // Bear in mind that start line, end line, and start column are all zero-indexed,
                // but the end column is not.
                const startingPosition: vscode.Position = diagnostic.range.start;
                const endingPosition: vscode.Position = diagnostic.range.end;
                expect(startingPosition.line).to.equal(spoofedViolation.line - 1, 'Wrong starting line');
                expect(startingPosition.character).to.equal(spoofedViolation.column - 1, 'Wrong starting column');
                expect(endingPosition.line).to.equal(spoofedViolation.line - 1, 'Wrong end line');
                expect(endingPosition.character).to.equal(Number.MAX_SAFE_INTEGER, 'Wrong end column');
            });

            test('Handles violation with line and column as 0', () => {
                // ===== SETUP =====
                const spoofedViolation: PathlessRuleViolation = JSON.parse(JSON.stringify(baseSpoofedViolation)) as PathlessRuleViolation;
                spoofedViolation.line = 0;
                spoofedViolation.column = 0;
                const diagnosticManager: DiagnosticManager = new DiagnosticManager();
            
                // ===== TEST =====
                const diagnostic: vscode.Diagnostic = (diagnosticManager as any).createDiagnostic("pmd", spoofedViolation);
            
                // ===== ASSERTIONS =====
                const startingPosition: vscode.Position = diagnostic.range.start;
                const endingPosition: vscode.Position = diagnostic.range.end;
                expect(startingPosition.line).to.equal(0, 'Wrong starting line');
                expect(startingPosition.character).to.equal(0, 'Wrong starting column');
                expect(endingPosition.line).to.equal(0, 'Wrong end line');
                expect(endingPosition.character).to.equal(Number.MAX_SAFE_INTEGER, 'Wrong end column');
            });
        });

        suite('DFA violations', () => {
            const baseDfaViolation: DfaRuleViolation = {
                ruleName: 'fakeDfaRule1',
                message: 'fakeMessage',
                severity: 1,
                category: 'fake category',
                sourceLine: 15,
                sourceColumn: 20,
                sourceType: 'MyClass1B',
                sourceMethodName: 'fakeMethod',
                sinkLine: 12,
                sinkColumn: 3,
                sinkFileName: path.join('path/to/some/file.cls')
            };

            // TODO: When/If we support diagnostic creation for DFA rules, this will need to change.
            test('Error thrown when DFA violations are provided', () => {
                // ===== SETUP =====
                // Create our diagnostic manager adn a copy of the violation.
                const diagnosticManager: DiagnosticManager = new DiagnosticManager();
                const spoofedDfaViolation: DfaRuleViolation = JSON.parse(JSON.stringify(baseDfaViolation)) as DfaRuleViolation;

                // ===== TEST =====
                // Feed the violation into the diagnostic manager, expecting an error.
                let err: Error = null;
                try {
                    const diagnostic: vscode.Diagnostic = (diagnosticManager as any).createDiagnostic('sfge', spoofedDfaViolation);
                } catch (e) {
                    err = e;
                }

                // ===== ASSERTIONS =====
                expect(err).to.exist;
                expect(err.message).to.equal('Diagnostics cannot be created from DFA violations');
            });
        });
    });
});
