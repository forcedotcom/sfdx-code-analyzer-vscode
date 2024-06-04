/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';
import {expect} from 'chai';
import path = require('path');
import Sinon = require('sinon');
import {messages} from '../../lib/messages';
import {_NoOpFixGenerator, _PmdFixGenerator} from '../../lib/fixer';

suite('fixer.ts', () => {
    // Note: __dirname is used here because it's consistent across file systems.
    const codeFixturesPath: string = path.resolve(__dirname, '..', '..', '..', 'code-fixtures', 'fixer-tests');

	teardown(async () => {
		// Close any open tabs and close the active editor.
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

    suite('_NoOpFixGenerator', () => {
        suite('#generateFixes()', () => {
            test('Returns empty array', () => {
                // Doesn't matter what we feed to the no-op constructor.
                const fixGenerator = new _NoOpFixGenerator(null, null);

                // Attempt to generate fixes.
                const fixes: vscode.CodeAction[] = fixGenerator.generateFixes();

                // Verify array is empty.
                expect(fixes).to.have.lengthOf(0, 'Should be no fixes');
            });
        });
    });

    suite('_PmdFixGenerator', () => {
        suite('#generateFixes()', () => {
            suite('XML doc', () => {
                // Get the URI for the XML doc.
                const xmlDocUri: vscode.Uri = vscode.Uri.file(path.join(codeFixturesPath, 'MyDoc1.xml'));

                // At this time, we don't support injecting suppression for XML.
                test('No fixes are offered', async () => {
                    // Open the document.
                    const doc = await vscode.workspace.openTextDocument(xmlDocUri);
					await vscode.window.showTextDocument(doc);
                    // Create a fake diagnostic.
                    const diag = new vscode.Diagnostic(
                        new vscode.Range(
                            new vscode.Position(7, 1),
                            new vscode.Position(7, 15)
                        ),
                        'This message is unimportant',
                        vscode.DiagnosticSeverity.Warning
                    );

                    // Instantiate our fixer.
                    const fixGenerator: _PmdFixGenerator = new _PmdFixGenerator(doc, diag);

                    // Attempt to generate fixes for the file.
                    const fixes: vscode.CodeAction[] = fixGenerator.generateFixes();

                    // We should get none.
                    expect(fixes).to.have.lengthOf(0, 'No fixes should be offered');
                });
            });

            suite('Apex doc', () => {
                let originalFileContents: string;
                const fileUri = vscode.Uri.file(path.join(codeFixturesPath, 'MyClass1.cls'));

                let doc: vscode.TextDocument;
                // Load the document and store its starting contents.
                setup(async () => {
                    doc = await vscode.workspace.openTextDocument(fileUri);
					await vscode.window.showTextDocument(doc);
                    originalFileContents = doc.getText();
                });

                suite('Line-level suppression', () => {
                    test('Appends suppression to end of commentless line', async () => {
                        // Create our fake diagnostic, positioned at the line with no comment at the end.
                        const diag = new vscode.Diagnostic(
                            new vscode.Range(
                                new vscode.Position(7, 4),
                                new vscode.Position(7, 10)
                            ),
                            'This message is unimportant',
                            vscode.DiagnosticSeverity.Warning
                        );

                        // Instantiate our fixer.
                        const fixGenerator: _PmdFixGenerator = new _PmdFixGenerator(doc, diag);

                        // Attempt to generate fixes for the file.
                        const fixes: vscode.CodeAction[] = fixGenerator.generateFixes();

                        // We expect to get one fix, to inject the suppression at the end of the line.
                        expect(fixes).to.have.lengthOf(2, 'Wrong action count');
                        const fix = fixes[0].edit.get(fileUri)[0];
                        expect(fix.newText).to.equal(' // NOPMD', 'Wrong suppression added');
                        expect(fix.range.start.isEqual(new vscode.Position(7, Number.MAX_SAFE_INTEGER))).to.equal(true, 'Should be at the end of the violation line');
                    });

                    /*
                    THIS TEST IS DISABLED FOR NOW. WHEN WE FIX BUG W-13816110, ENABLE THIS TEST.
                    test('Injects suppression at start of existing end-of-line comment', () => {
                        // Create our fake diagnostic, positioned at the line with a comment at the end.
                        const diag = new vscode.Diagnostic(
                            new vscode.Range(
                                new vscode.Position(12, 4),
                                new vscode.Position(12, 10)
                            ),
                            'This message is unimportant',
                            vscode.DiagnosticSeverity.Warning
                        );

                        // Instantiate our fixer.
                        const fixGenerator: _PmdFixGenerator = new _PmdFixGenerator(doc, diag);

                        // Attempt to generate fixes for the file.
                        const fixes: vscode.CodeAction[] = fixGenerator.generateFixes();

                        // We expect to get one fix, to inject the suppression at the s tart of the comment that ends the line.
                        expect(fixes).to.have.lengthOf(1, 'Wrong action count');
                        const fix = fixes[0].edit.get(fileUri)[0];
                        expect(fix.newText).to.equal(' NOPMD', 'Wrong suppression added');
                        expect(fix.range.start.isEqual(new vscode.Position(12, 53))).to.equal(true, 'Should be at start of end-of-line comment');
                    });
                    */
                });

                suite('Class-level suppression', () => {
                    test('Find class start position above the diagnostic line', async () => {
                        const fileUri = vscode.Uri.file(path.join(codeFixturesPath, 'MyClass1.cls'));

                        let doc: vscode.TextDocument;
                        doc = await vscode.workspace.openTextDocument(fileUri);
                        const diag = new vscode.Diagnostic(
                            new vscode.Range(
                                new vscode.Position(7, 4),
                                new vscode.Position(7, 10)
                            ),
                            'This message is unimportant',
                            vscode.DiagnosticSeverity.Warning
                        );

                        // Instantiate our fixer
                        const fixGenerator: _PmdFixGenerator = new _PmdFixGenerator(doc, diag);

                        // Call findClassStartPosition method
                        const position = fixGenerator.findClassStartPosition(diag, doc);

                        // Verify the position is correct
                        expect(position.line).to.equal(6);
                        expect(position.character).to.equal(0);
                    });
                });
            });
        });
    });
});
