/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import path = require('path');
import * as vscode from 'vscode';
import Sinon = require('sinon');
import {expect} from 'chai';
import {getSelectedMethod, getTargets} from '../../lib/targeting';
import {ApexLsp, GenericSymbol} from '../../lib/apex-lsp';

suite('targeting.ts', () => {
    // Note: This path is relative to the project's root directory.
    const codeFixturesPath: string = path.resolve('.', 'code-fixtures');

    function moveCursor(line: number, column: number): void {
        const position = new vscode.Position(line, column);
        vscode.window.activeTextEditor.selection = new vscode.Selection(position, position);
    }

    suite('#getTargets()', () => {
        test('Given a real file, returns that file', async () => {
            // ===== SETUP =====
            // Get a URI for one file.
            const singlePath: string = path.join(codeFixturesPath, "folder-a", "MyClassA1.cls");
            const singleUri: vscode.Uri = vscode.Uri.parse(singlePath);

            // ===== TEST =====
            // Feed that URI into the target finder.
            const targets: string[] = await getTargets([singleUri]);

            // ===== ASSERTIONS =====
            // Verify we got the right output.
            expect(targets).to.have.lengthOf(1, 'Wrong number of targets returned');
            expect(targets[0]).to.equal(singlePath, 'Wrong file returned');
        });

        test('Given multiple real files, returns them', async () => {
            // ===== SETUP =====
            // Get a few URIs for some files in a few folders.
            const multiplePaths: string[] = [
                path.join(codeFixturesPath, "folder-a", "MyClassA2.cls"),
                path.join(codeFixturesPath, "folder-a", "MyClassA3.cls"),
                path.join(codeFixturesPath, "folder-a", "subfolder-a1", "MyClassA1i.cls"),
                path.join(codeFixturesPath, "folder-b", "MyClassB1.cls")
            ];
            const multipleUris: vscode.Uri[] = multiplePaths.map(p => vscode.Uri.parse(p));

            // ===== TEST =====
            // Feed those URIs into the target finder.
            const targets: string[] = await getTargets(multipleUris);

            // ===== ASSERTIONS =====
            // Verify we got the right outputs.
            expect(targets).to.have.lengthOf(4, 'Wrong number of targets returned');
            expect(targets[0]).to.equal(multiplePaths[0], 'Wrong file returned');
            expect(targets[1]).to.equal(multiplePaths[1], 'Wrong file returned');
            expect(targets[2]).to.equal(multiplePaths[2], 'Wrong file returned');
            expect(targets[3]).to.equal(multiplePaths[3], 'Wrong file returned');
        });

        test('Given a real folder with no subfolders, returns its contents', async () => {
            // ===== SETUP =====
            // Get a URI for a folder without subfolders.
            const folderPath: string = path.join(codeFixturesPath, "folder-a", "subfolder-a1");
            const folderUri: vscode.Uri = vscode.Uri.parse(folderPath);

            // ===== TEST =====
            // Feed the URI into the target finder.
            const targets: string[] = await getTargets([folderUri]);

            // ===== ASSERTIONS =====
            // Verify we got the right outputs.
            expect(targets).to.have.lengthOf(2, 'Wrong number of targets returned');
            expect(targets[0]).to.equal(path.join(folderPath, "MyClassA1i.cls"), 'Wrong file returned');
            expect(targets[1]).to.equal(path.join(folderPath, "MyClassA1ii.cls"), 'Wrong file returned');
        });

        test('Given a real folder with subfolders, returns contents deeply', async () => {
            // ===== SETUP =====
            // Get a URI for a folder with subfolders.
            const folderPath: string = path.join(codeFixturesPath, "folder-a");
            const folderUri: vscode.Uri = vscode.Uri.parse(folderPath);

            // ===== TEST =====
            // Feed the URI into the target finder.
            const targets: string[] = await getTargets([folderUri]);

            // ===== ASSERTIONS =====
            // Verify we got the right outputs.
            expect(targets).to.have.lengthOf(5, 'Wrong number of targets returned');
            expect(targets[0]).to.equal(path.join(folderPath, "MyClassA1.cls"), "Wrong file returned");
            expect(targets[1]).to.equal(path.join(folderPath, "MyClassA2.cls"), "Wrong file returned");
            expect(targets[2]).to.equal(path.join(folderPath, "MyClassA3.cls"), "Wrong file returned");
            expect(targets[3]).to.equal(path.join(folderPath, "subfolder-a1", "MyClassA1i.cls"), "Wrong file returned");
            expect(targets[4]).to.equal(path.join(folderPath, "subfolder-a1", "MyClassA1ii.cls"), "Wrong file returned");
        });

        test('Given a non-existent file, throws error', async () => {
            // ===== SETUP =====
            // Get a URI for a non-existent file.
            const fakeFilePath: string = path.join(codeFixturesPath, "folder-a", "DefinitelyFakeClass.cls");
            const fakeFileUri: vscode.Uri = vscode.Uri.parse(fakeFilePath);
            
            // ===== TEST =====
            // Feed the URI into the target finder, expecting an error.
            let err: Error = null;
            try {
                const targets: string[] = await getTargets([fakeFileUri]);
            } catch (e) {
                err = e;
            }
            // ===== ASSERTIONS =====
            // Expect that an error was thrown.
            // TODO: test error message instead of error existence.
            expect(err).to.not.be.null;
        });

        test('Given no file, returns file active in editor', async () => {
            // ===== SETUP =====
            // Open a file in the editor.
            const openFilePath: string = path.join(codeFixturesPath, 'folder-a', 'MyClassA1.cls');
            const openFileUri: vscode.Uri = vscode.Uri.parse(openFilePath);
            const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(openFileUri);
            await vscode.window.showTextDocument(doc);

            // ===== TEST =====
            // Feed an empty array into the target finder.
            const targets: string[] = await getTargets([]);

            // ===== ASSERTIONS =====
            expect(targets).to.have.lengthOf(1, 'Wrong nubmer of targets returned');
            expect(targets[0]).to.equal(openFilePath, 'Wrong file returned');
        });

        test('Without selection or active file, throws error', async () => {
            // ===== SETUP =====
            // Make sure there's no file open in the editor.
            const tabs: vscode.Tab[] = vscode.window.tabGroups.all.map(tg => tg.tabs).flat();
            for (let i = 0; i < tabs.length; i++) {
                await vscode.window.tabGroups.close(tabs[i]);
            }

            // ===== TEST =====
            // Feed an empty array into target finder, expecting an error.
            let err: Error = null;
            try {
                const targets: string[] = await getTargets([]);
            } catch (e) {
                err = e;
            }

            // ===== ASSERTIONS =====
            // Expect that an error was thrown.
            // TODO: test error message instead of error existence.
            expect(err).to.not.be.null;
        });
    });

    suite('#getSelectedMethod()', () => {
        suite('When Apex LSP is available...', () => {
            const openFilePath: string = path.join(codeFixturesPath, 'folder-a', 'MyClassA1.cls');
            const openFileUri: vscode.Uri = vscode.Uri.parse(openFilePath);

            setup(async () => {
                // Open and display the document.
                const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(openFileUri);
                await vscode.window.showTextDocument(doc);
                // Declare a spoofed array of symbols like what we'd get from the Apex LSP, then
                // use a stub to return it.
                const symbols: GenericSymbol[] = [
                    new vscode.SymbolInformation('MyClassA1', vscode.SymbolKind.Class, '',
                        new vscode.Location(openFileUri, new vscode.Range(
                            new vscode.Position(6, 26), new vscode.Position(6, 35)
                        ))
                    ),
                    new vscode.SymbolInformation('beep() : Boolean', vscode.SymbolKind.Method, '',
                        new vscode.Location(openFileUri, new vscode.Range(
                            new vscode.Position(7, 26), new vscode.Position(7, 30)
                        ))
                    ),
                    new vscode.SymbolInformation('boop() : Boolean', vscode.SymbolKind.Method, '',
                        new vscode.Location(openFileUri, new vscode.Range(
                            new vscode.Position(11, 26), new vscode.Position(11, 30)
                        ))
                    ),
                    new vscode.SymbolInformation('instanceBoop() : Boolean', vscode.SymbolKind.Method, '',
                        new vscode.Location(openFileUri, new vscode.Range(
                            new vscode.Position(15, 19), new vscode.Position(15, 31)
                        ))
                    )
                ];
                Sinon.stub(ApexLsp, 'getSymbols').resolves(symbols);
            });

            teardown(() => {
                // Revert any stubbing/spying we did with Sinon.
                Sinon.restore();
            });

            test('Returns nearest preceding method if locateable', async () => {
                // ===== SETUP =====
                // Move the cursor to a line with a preceding method.
                moveCursor(14, 0);

                // ===== TEST =====
                // Get the method currently selected.
                const selectedMethod: string = await getSelectedMethod();
                
                // ===== ASSERTIONS =====
                expect(selectedMethod).to.equal(`${openFilePath}#boop`, 'Wrong method identified');
            });

            test('Throws error if no method can be found', async () => {
                // ===== SETUP =====
                // Move the cursor to the beginning of the doc, where there's
                // definitely no method.
                moveCursor(6, 15);

                // ===== TEST =====
                // Attempt to get the method currently selected, expecting an error.
                let err: Error = null;
                try {
                    const selectedMethod: string = await getSelectedMethod();
                } catch (e) {
                    err = e;
                }

                // ===== ASSERTIONS =====
                // Verify we got the right error.
                expect(err).to.not.be.null;
            });
        });

        suite('When Apex LSP is unavailable...', () => {
            let warningSpy;
            setup(() => {
                // Simulate the Apex LSP being unavailable by stubbing the appropriate
                // method to return `undefined`.
                Sinon.stub(ApexLsp, 'getSymbols').resolves(undefined);
                // Create a Spy so we can see what's going on with the warnings.
                warningSpy = Sinon.spy(vscode.window, 'showWarningMessage')
            });

            teardown(() => { 
                // Revert any stubbing/spying we did with Sinon.
                Sinon.restore();
            });

            test('Displays warning and returns current word', async () => {
                // ===== SETUP =====
                // Open a file in the editor.
                const openFilePath: string = path.join(codeFixturesPath, 'folder-a', 'MyClassA1.cls');
                const openFileUri: vscode.Uri = vscode.Uri.parse(openFilePath);
                const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(openFileUri);
                await vscode.window.showTextDocument(doc);
                // Move the cursor to the declaration of a method.
                vscode.window.activeTextEditor.selection = new vscode.Selection(new vscode.Position(7, 29), new vscode.Position(7, 29));

                // ===== TEST =====
                // Attempt to get the currently selected method.
                const selectedMethod: string = await getSelectedMethod();

                // ===== ASSERTIONS =====
                // Verify that a warning was displayed.
                Sinon.assert.callCount(warningSpy, 1);
                // Verify that the first word of the file was returned.
                expect(selectedMethod).to.equal(`${openFilePath}#beep`, 'Wrong word returned');
            });
        });
    });
});