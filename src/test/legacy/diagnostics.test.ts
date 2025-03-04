/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';
import {expect} from 'chai';
import * as path from 'path';
import {DiagnosticConvertible, DiagnosticManagerImpl} from '../../lib/diagnostics';

suite('diagnostics.ts', () => {
    suite('#displayAsDiagnostics()', () => {
        // Note: Because this is a mocha test, __dirname here is actually the location of the js file in the out/test folder.
        const codeFixturesPath: string = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'code-fixtures');
        
        const pathToFirstFile: string = path.join(codeFixturesPath, 'folder-a', 'MyClassA1.cls');
		const firstFileConvertibles: DiagnosticConvertible[] = [{
			rule: 'fakeRule1',
			engine: 'pmd',
			message: 'fakeMessage',
			severity: 1,
			locations: [{
				file: pathToFirstFile,
				startLine: 12,
				startColumn: 2
			}],
			primaryLocationIndex: 0,
			resources: []
		}]
        const firstFileApexSharingViolationsConvertibles: DiagnosticConvertible[] = [{
			rule: 'ApexSharingViolations',
			engine: 'pmd',
			message: 'fakeMessage',
			severity: 1,
			locations: [{
				file: pathToFirstFile,
				startLine: 12,
				startColumn: 2,
                endLine: 13,
                endColumn: 3
			}],
			primaryLocationIndex: 0,
			resources: []
		}]
        const pathToSecondFile: string = path.join(codeFixturesPath, 'folder-a', 'MyClassA2.cls');
		const secondFileConvertibles: DiagnosticConvertible[] = [{
			rule: 'fakeRule1',
			engine: 'pmd',
			message: 'fakeMessage',
			severity: 1,
			locations: [{
				file: pathToSecondFile,
				startLine: 19,
				startColumn: 2
			}],
			primaryLocationIndex: 0,
			resources: []
		}, {
			rule: 'fakeRule2',
			engine: 'pmd',
			message: 'fakeMessage',
			severity: 1,
			locations: [{
				file: pathToSecondFile,
				startLine: 3,
				startColumn: 15
			}],
			primaryLocationIndex: 0,
			resources: []
		}];

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
            const diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);

            // ===== TEST =====
            // Simulate a run against target 1 that returned some results.
            diagnosticManager.displayAsDiagnostics([pathToFirstFile], firstFileConvertibles);

            // ===== ASSERTIONS =====
            // Validate that the file now has one violation.
            expect(diagnosticCollection.get(vscode.Uri.file(pathToFirstFile))).to.have.lengthOf(1, 'Wrong number of diagnostics');
        });

        test('Changes ApexSharingViolations end lines to be start lines', () => {
            // ===== SETUP =====
            // Create a diagnostic manager.
            const diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);

            // ===== TEST =====
            // Simulate a run against target 1 that returned some results.
            diagnosticManager.displayAsDiagnostics([pathToFirstFile], firstFileApexSharingViolationsConvertibles);

            // ===== ASSERTIONS =====
            // Validate that the file now has one violation.
            expect(diagnosticCollection.get(vscode.Uri.file(pathToFirstFile))).to.have.lengthOf(1, 'Wrong number of diagnostics');
            expect(diagnosticCollection.get(vscode.Uri.file(pathToFirstFile))[0].range.start).to.deep.equal(new vscode.Position(11,1), 'Incorrect start position');
            expect(diagnosticCollection.get(vscode.Uri.file(pathToFirstFile))[0].range.end).to.deep.equal(new vscode.Position(11, Number.MAX_SAFE_INTEGER), 'Incorrect end position');
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
            const diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);

            // ===== TEST =====
            // Simulate a run against file 2 that returned different results than were already present.
            diagnosticManager.displayAsDiagnostics([pathToSecondFile], secondFileConvertibles);

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
            const diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);

            // ===== TEST =====
            // Simulate a run against file 2 that returned no results.
            diagnosticManager.displayAsDiagnostics([pathToSecondFile], []);

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
            const diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);

            // ===== TEST =====
            // Simulate a run against file 1 that returned results.
            diagnosticManager.displayAsDiagnostics([pathToFirstFile], firstFileConvertibles);

            // ===== ASSERTIONS =====
            // Verify that the violations in file 2 are unchanged.
            expect(diagnosticCollection.get(secondFileUri)).to.have.lengthOf(1, 'Wrong number of results');
        });
    });
});
