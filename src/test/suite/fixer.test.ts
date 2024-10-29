/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';
import {expect} from 'chai';
import path = require('path');
import * as Constants from '../../lib/constants';
import {_NoOpFixGenerator, _PmdFixGenerator, _ApexGuruFixGenerator} from '../../lib/fixer';

suite('fixer.ts', () => {
    // Note: __dirname is used here because it's consistent across file systems.
    const codeFixturesPath: string = path.resolve(__dirname, '..', '..', '..', 'code-fixtures', 'fixer-tests');

	teardown(async () => {
		// Close any open tabs and close the active editor.
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

    suite('_NoOpFixGenerator', () => {
        const existingFixes = new Set<number>(); 
        suite('#generateFixes()', () => {
            test('Returns empty array', () => {
                // Doesn't matter what we feed to the no-op constructor.
                const fixGenerator = new _NoOpFixGenerator(null, null);

                // Attempt to generate fixes.
                const fixes: vscode.CodeAction[] = fixGenerator.generateFixes(existingFixes);

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
                    const fixes: vscode.CodeAction[] = fixGenerator.generateFixes(null);

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
                    const existingFixes = new Set<number>(); 
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
                        const fixes: vscode.CodeAction[] = fixGenerator.generateFixes(existingFixes);

                        // We expect to get one fix, to inject the suppression at the end of the line.
                        expect(fixes).to.have.lengthOf(2, 'Wrong action count');
                        const fix = fixes[0].edit.get(fileUri)[0];
                        expect(fix.newText).to.equal(' // NOPMD', 'Wrong suppression added');
                        expect(fix.range.start.isEqual(new vscode.Position(7, Number.MAX_SAFE_INTEGER))).to.equal(true, 'Should be at the end of the violation line');
                    });

                    test('Does not add suppression if suppression for that same line already exists', async () => {
                        existingFixes.add(7);
                        // Create our fake diagnostic whose start position is the same as the existing fix already added
                        const diag = new vscode.Diagnostic(
                            new vscode.Range(
                                new vscode.Position(7, 0),
                                new vscode.Position(8, 0)
                            ),
                            'This message is unimportant',
                            vscode.DiagnosticSeverity.Warning
                        );

                        // Instantiate our fixer.
                        const fixGenerator: _PmdFixGenerator = new _PmdFixGenerator(doc, diag);

                        // Attempt to generate fixes for the file.
                        const fixes: vscode.CodeAction[] = fixGenerator.generateFixes(existingFixes);

                        // We expect to get one fix (class level suppression), no new line level suppression added since there is already a fix
                        expect(fixes).to.have.lengthOf(1, 'Wrong action count');
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
                    suite('#findClassStartPosition()', () => {
                        test('Should find class start position above the diagnostic line', async () => {
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

                        test('Should ignore class defined in single line comment', async () => {
                            const fileUri = vscode.Uri.file(path.join(codeFixturesPath, 'MyClass2.cls'));

                            let doc: vscode.TextDocument;
                            doc = await vscode.workspace.openTextDocument(fileUri);
                            const diag = new vscode.Diagnostic(
                                new vscode.Range(
                                    new vscode.Position(10, 0),
                                    new vscode.Position(10, 1)
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

                        test('Should ignore class defined in a block comment comment', async () => {
                            const fileUri = vscode.Uri.file(path.join(codeFixturesPath, 'MyClass2.cls'));

                            let doc: vscode.TextDocument;
                            doc = await vscode.workspace.openTextDocument(fileUri);
                            const diag = new vscode.Diagnostic(
                                new vscode.Range(
                                    new vscode.Position(17, 0),
                                    new vscode.Position(17, 1)
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

                        test('Should ignore class defined as a string', async () => {
                            const fileUri = vscode.Uri.file(path.join(codeFixturesPath, 'MyClass2.cls'));

                            let doc: vscode.TextDocument;
                            doc = await vscode.workspace.openTextDocument(fileUri);
                            const diag = new vscode.Diagnostic(
                                new vscode.Range(
                                    new vscode.Position(23, 0),
                                    new vscode.Position(23, 1)
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
                        test('Should ignore inner class', async () => {
                            const fileUri = vscode.Uri.file(path.join(codeFixturesPath, 'MyClass2.cls'));

                            let doc: vscode.TextDocument;
                            doc = await vscode.workspace.openTextDocument(fileUri);
                            const diag = new vscode.Diagnostic(
                                new vscode.Range(
                                    new vscode.Position(27, 0),
                                    new vscode.Position(27, 1)
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
                suite('#generateNewSuppressionTag()', () => {
                    // Instantiate our fixer
                    const fixGenerator: _PmdFixGenerator = new _PmdFixGenerator(null, null);

                    test('Should generate the correct suppression tag for Apex language', async () => {
                        const suppressionRule = 'rule1';
                        const lang = 'apex';
                        const expectedSuppressionTag = `@SuppressWarnings('${suppressionRule}')\n`;
                        expect(fixGenerator.generateNewSuppressionTag(suppressionRule, lang)).to.equal(expectedSuppressionTag);
                    });
                
                    test('Should generate the correct suppression tag for Java language', async () => {
                        const suppressionRule = 'rule2';
                        const lang = 'java';
                        const expectedSuppressionTag = `@SuppressWarnings("${suppressionRule}")\n`;
                        expect(fixGenerator.generateNewSuppressionTag(suppressionRule, lang)).to.equal(expectedSuppressionTag);
                    });
                
                    test('Should return an empty string for unsupported languages', async () => {
                        const suppressionRule = 'rule3';
                        const lang = 'python'; // Assuming python as an unsupported language
                        expect(fixGenerator.generateNewSuppressionTag(suppressionRule, lang)).to.equal('');
                    });
                });
                suite('#generateUpdatedSuppressionTag()', () => {
                    // Instantiate our fixer
                    const fixGenerator: _PmdFixGenerator = new _PmdFixGenerator(null, null);
                
                    test('Should generate the correct suppression tag for Apex language with single quotes', async () => {
                        const updatedRules = 'rule1';
                        const lang = 'apex';
                        const expectedSuppressionTag = `@SuppressWarnings('${updatedRules}')`;
                        expect(fixGenerator.generateUpdatedSuppressionTag(updatedRules, lang)).to.equal(expectedSuppressionTag);
                    });
                
                    test('Should generate the correct suppression tag for Java language with double quotes', async () => {
                        const updatedRules = 'rule2';
                        const lang = 'java';
                        const expectedSuppressionTag = `@SuppressWarnings("${updatedRules}")`;
                        expect(fixGenerator.generateUpdatedSuppressionTag(updatedRules, lang)).to.equal(expectedSuppressionTag);
                    });
                
                    test('Should return an empty string for unsupported languages', async () => {
                        const updatedRules = 'rule3';
                        const lang = 'python'; // Assuming python as an unsupported language
                        expect(fixGenerator.generateUpdatedSuppressionTag(updatedRules, lang)).to.equal('');
                    });
                });
                suite('#findLineBeforeClassStartDeclaration()', () => {
                    // Instantiate our fixer
                    const fixGenerator: _PmdFixGenerator = new _PmdFixGenerator(null, null);
                
                    test('Should find the correct line before class start declaration when it is not the first line', async () => {
                        const classStartPosition = new vscode.Position(2, 0);
                        const document = {
                            lineAt: (lineNumber: number) => {
                                return {
                                    // Simulating document content and for easy testing, line number starts at 0
                                    text: `This is line ${lineNumber}`,
                                };
                            },
                        } as vscode.TextDocument;
                
                        // Call findLineBeforeClassStartDeclaration method
                        const line = fixGenerator.findLineBeforeClassStartDeclaration(classStartPosition, document);
                
                        // Verify the line content is correct
                        expect(line).to.equal('This is line 1');
                    });

                    test('Should return empty string when class declaration is the first line', async () => {
                        const classStartPosition = new vscode.Position(0, 0);
                        const document = {
                            lineAt: (lineNumber: number) => {
                                return {
                                    // Simulating document content and for easy testing, line number starts at 0
                                    text: `This is line ${lineNumber}`,
                                };
                            },
                        } as vscode.TextDocument;
                
                        // Call findLineBeforeClassStartDeclaration method
                        const line = fixGenerator.findLineBeforeClassStartDeclaration(classStartPosition, document);
                
                        // Verify the line content is correct
                        expect(line).to.equal('');
                    });
                });
                suite('#isWithinQuotes()', () => {
                    // Instantiate our fixer
                    const fixGenerator: _PmdFixGenerator = new _PmdFixGenerator(null, null);
                
                    test('Should return true if the match is within single quotes', async () => {
                        const line = "This is 'a matching string'";
                        const matchIndex = 15; // Index where match occurs within the string
                        const isWithin = fixGenerator.isWithinQuotes(line, matchIndex);
                        expect(isWithin).to.equal(true);
                    });
                
                    test('Should return true if the match is within double quotes', async () => {
                        const line = 'This is "a matching string"';
                        const matchIndex = 21; // Index where match occurs within the string
                        const isWithin = fixGenerator.isWithinQuotes(line, matchIndex);
                        expect(isWithin).to.equal(true);
                    });
                
                    test('Should return false if the match is not within quotes', async () => {
                        const line = 'This is a line without quotes';
                        const matchIndex = 5; // Index where match occurs within the string
                        const isWithin = fixGenerator.isWithinQuotes(line, matchIndex);
                        expect(isWithin).to.equal(false);
                    });
                
                    test('Should return false if the match is at the start of a string within quotes', async () => {
                        const line = "'quotes' is at the start of a string";
                        const matchIndex = 10; // Index where match occurs within the string and it is after the quotes
                        const isWithin = fixGenerator.isWithinQuotes(line, matchIndex);
                        expect(isWithin).to.equal(false);
                    });
                
                    test('Should return true if the match is at the start of a string but quotes is not closed', async () => {
                        // This is an extreme case where someone opens a quote and has class defined in it
                        // and the closure of the quote is not on the same line.
                        const line = "'quotes is at the start of a string";
                        const matchIndex = 10; // Index where match occurs within the string and it is after the quotes
                        const isWithin = fixGenerator.isWithinQuotes(line, matchIndex);
                        expect(isWithin).to.equal(true);
                    });

                });
                
            });
        });
        suite('Regex Pattern Tests', () => {
            let fixGenerator: _PmdFixGenerator;
    
            setup(() => {
                fixGenerator = new _PmdFixGenerator(null, null);
            });
    
            test('singleLineCommentPattern matches single-line comments', () => {
                const pattern = fixGenerator.singleLineCommentPattern;
    
                // Matching cases
                expect(pattern.test('// This is a single-line comment')).to.be.true;
    
                // Non-matching cases
                expect(pattern.test('This is not a comment')).to.be.false;
                expect(pattern.test('/* This is a block comment start */')).to.be.false;
            });
    
            test('blockCommentStartPattern matches block comment starts', () => {
                const pattern = fixGenerator.blockCommentStartPattern;
    
                // Matching cases
                expect(pattern.test('/* This is a block comment start')).to.be.true;
                expect(pattern.test('    /* This is an indented block comment start')).to.be.true;
    
                // Non-matching cases
                expect(pattern.test('This is not a comment')).to.be.false;
                expect(pattern.test('// This is a single-line comment')).to.be.false;
                expect(pattern.test('*/ This is a block comment end')).to.be.false;
            });
    
            test('blockCommentEndPattern matches block comment ends', () => {
                const pattern = fixGenerator.blockCommentEndPattern;
    
                // Matching cases
                expect(pattern.test('*/')).to.be.true;
                expect(pattern.test('    */ This is an indented block comment end')).to.be.true;
    
                // Non-matching cases
                expect(pattern.test('This is not a comment')).to.be.false;
                expect(pattern.test('// This is a single-line comment')).to.be.false;
                expect(pattern.test('/* This is a block comment start')).to.be.false;
            });
    
            test('classDeclarationPattern matches class declarations', () => {
                const pattern = fixGenerator.classDeclarationPattern;
    
                // Matching cases
                expect(pattern.test('public class MyClass')).to.be.true;
                expect(pattern.test('final public class MyClass')).to.be.true;
                expect(pattern.test('   private static class MyClass')).to.be.true;
    
                // Non-matching cases
                expect(pattern.test('class="MyClass"')).to.be.false; // HTML-like attribute
                expect(pattern.test('String myClass = "some value"')).to.be.false;
            });
    
            test('suppressionRegex matches @SuppressWarnings annotations', () => {
                const pattern = fixGenerator.suppressionRegex;
    
                // Matching cases
                expect(pattern.test("@SuppressWarnings('PMD.Rule')")).to.be.true;
                expect(pattern.test("@suppresswarnings('pmd.rule')")).to.be.true;
                expect(pattern.test("@suppresswarnings('PMD.Rule')")).to.be.true;
                expect(pattern.test('@SuppressWarnings("PMD.Rule")')).to.be.true;
    
                // Non-matching cases
                expect(pattern.test('This is not a suppression annotation')).to.be.false;
                expect(pattern.test('@SuppressWarnings')).to.be.false;
                expect(pattern.test('SuppressWarnings("PMD.Rule")')).to.be.false; // Missing '@'
            });
        });    
    });
    suite('_ApexGuruFixGenerator', () => {
        const fileUri = vscode.Uri.file(path.join(codeFixturesPath, 'MyClass1.cls'));
        suite('#generateFixes()', () => {
            const processedLines = new Set<number>();
            const fileUri = vscode.Uri.file(path.join(codeFixturesPath, 'MyClass1.cls'));
    
            let doc: vscode.TextDocument;
            // Load the document and store its starting contents.
            setup(async () => {
                doc = await vscode.workspace.openTextDocument(fileUri);
                await vscode.window.showTextDocument(doc);
            });
    
            test('Should generate a suppression fix if line is not processed', async () => {
                // Create a fake diagnostic.
                const diag = new vscode.Diagnostic(
                    new vscode.Range(
                        new vscode.Position(7, 4),
                        new vscode.Position(7, 10)
                    ),
                    'some message',
                    vscode.DiagnosticSeverity.Warning
                );
                diag.relatedInformation = [
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(fileUri, new vscode.Position(0, 0)),
                        'current code'
                    ),
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(fileUri, new vscode.Position(0, 0)),
                        'apex guru suggested code'
                    )
                ];
    
                // Instantiate the fixer.
                const fixGenerator: _ApexGuruFixGenerator = new _ApexGuruFixGenerator(doc, diag);
    
                // Generate fixes.
                const fixes: vscode.CodeAction[] = fixGenerator.generateFixes(processedLines, doc, diag);
    
                // Validate results.
                expect(fixes).to.have.lengthOf(1, 'One fix should be offered');
                expect(fixes[0].command.command).to.equal(Constants.COMMAND_INCLUDE_APEX_GURU_SUGGESTIONS);
            });
    
            test('Should not generate a suppression fix if line is already processed', async () => {
                processedLines.add(7);
    
                // Create a fake diagnostic.
                const diag = new vscode.Diagnostic(
                    new vscode.Range(
                        new vscode.Position(7, 4),
                        new vscode.Position(7, 10)
                    ),
                    'This message is unimportant',
                    vscode.DiagnosticSeverity.Warning
                );
                diag.relatedInformation = [
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(fileUri, new vscode.Position(0, 0)),
                        'current code'
                    ),
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(fileUri, new vscode.Position(0, 0)),
                        'apex guru suggested code'
                    )
                ];
    
                // Instantiate the fixer.
                const fixGenerator: _ApexGuruFixGenerator = new _ApexGuruFixGenerator(doc, diag);
    
                // Generate fixes.
                const fixes: vscode.CodeAction[] = fixGenerator.generateFixes(processedLines, doc, diag);
    
                // Validate results.
                expect(fixes).to.have.lengthOf(0, 'No fix should be offered if the line is already processed');
            });
        });
    
        suite('#generateApexGuruSuppresssion()', () => {
            let doc: vscode.TextDocument;
            // Load the document and store its starting contents.
            setup(async () => {
                doc = await vscode.workspace.openTextDocument(fileUri);
                await vscode.window.showTextDocument(doc);
            });

            test('Should generate the correct ApexGuru suppression code action', async () => {
                // Create a fake diagnostic.
                const diag = new vscode.Diagnostic(
                    new vscode.Range(
                        new vscode.Position(7, 4),
                        new vscode.Position(7, 10)
                    ),
                    'Some message',
                    vscode.DiagnosticSeverity.Warning
                );
                diag.relatedInformation = [
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(fileUri, new vscode.Position(0, 0)),
                        'Some other information'
                    ),
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(fileUri, new vscode.Position(0, 0)),
                        'apex guru suggested code'
                    )
                ];
    
                // Instantiate the fixer.
                const fixGenerator: _ApexGuruFixGenerator = new _ApexGuruFixGenerator(doc, diag);
    
                // Generate the suppression code action.
                const fix = fixGenerator.generateApexGuruSuppresssion(doc);
    
                // Validate results.
                expect(fix.command.command).to.equal(Constants.COMMAND_INCLUDE_APEX_GURU_SUGGESTIONS);
            });
        });
    });
});
