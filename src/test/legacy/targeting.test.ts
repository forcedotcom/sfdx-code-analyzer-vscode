/* eslint-disable @typescript-eslint/no-unused-expressions */ // TODO: Need to update these old tests... many of the chair assertions are not being used correctly causing eslint errors.
/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as path from 'path';
import * as vscode from 'vscode';
import * as Sinon from 'sinon';
import {expect} from 'chai';
import {getFilesFromSelection} from '../../lib/targeting';

suite('targeting.ts', () => {
    // Note: Because this is a mocha test, __dirname here is actually the location of the js file in the out/test folder.
    const codeFixturesPath: string = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'code-fixtures');

    teardown(async () => {
        // Close all open editors after each test.
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        Sinon.restore();
    });

    suite('#getTargets()', () => {
        test('Given a real file, returns that file', async () => {
            // ===== SETUP =====
            // Get a URI for one file.
            const singlePath: string = path.join(codeFixturesPath, "folder a", "MyClassA1.cls");
            const singleUri: vscode.Uri = vscode.Uri.file(singlePath);

            // ===== TEST =====
            // Feed that URI into the target finder.
            const targets: string[] = await getFilesFromSelection([singleUri]);

            // ===== ASSERTIONS =====
            // Verify we got the right output.
            expect(targets).to.have.lengthOf(1, 'Wrong number of targets returned');
            expect(targets[0]).to.equal(singlePath, 'Wrong file returned');
        });

        test('Given multiple real files, returns them', async () => {
            // ===== SETUP =====
            // Get a few URIs for some files in a few folders.
            const multiplePaths: string[] = [
                path.join(codeFixturesPath, "folder a", "MyClassA2.cls"),
                path.join(codeFixturesPath, "folder a", "MyClassA3.cls"),
                path.join(codeFixturesPath, "folder a", "subfolder-a1", "MyClassA1i.cls"),
                path.join(codeFixturesPath, "folder-b", "MyClassB1.cls")
            ];
            const multipleUris: vscode.Uri[] = multiplePaths.map(p => vscode.Uri.file(p));

            // ===== TEST =====
            // Feed those URIs into the target finder.
            const targets: string[] = await getFilesFromSelection(multipleUris);

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
            const folderPath: string = path.join(codeFixturesPath, "folder a", "subfolder-a1");
            const folderUri: vscode.Uri = vscode.Uri.file(folderPath);

            // ===== TEST =====
            // Feed the URI into the target finder.
            const targets: string[] = await getFilesFromSelection([folderUri]);

            // ===== ASSERTIONS =====
            // Verify we got the right outputs.
            expect(targets).to.have.lengthOf(2, 'Wrong number of targets returned: ' + JSON.stringify(targets, null, 2));
            expect(targets).to.contain(path.join(folderPath, "MyClassA1i.cls"), 'Wrong file returned');
            expect(targets).to.contain(path.join(folderPath, "MyClassA1ii.cls"), 'Wrong file returned');
        });

        test('Given a real folder with subfolders, returns contents deeply', async () => {
            // ===== SETUP =====
            // Get a URI for a folder with subfolders.
            const folderPath: string = path.join(codeFixturesPath, "folder a");
            const folderUri: vscode.Uri = vscode.Uri.file(folderPath);

            // ===== TEST =====
            // Feed the URI into the target finder.
            const targets: string[] = await getFilesFromSelection([folderUri]);

            // ===== ASSERTIONS =====
            // Verify we got the right outputs.
            expect(targets).to.have.lengthOf(5, 'Wrong number of targets returned: ' + JSON.stringify(targets, null, 2));
            expect(targets).to.contain(path.join(folderPath, "MyClassA1.cls"), "Wrong file returned");
            expect(targets).to.contain(path.join(folderPath, "MyClassA2.cls"), "Wrong file returned");
            expect(targets).to.contain(path.join(folderPath, "MyClassA3.cls"), "Wrong file returned");
            expect(targets).to.contain(path.join(folderPath, "subfolder-a1", "MyClassA1i.cls"), "Wrong file returned");
            expect(targets).to.contain(path.join(folderPath, "subfolder-a1", "MyClassA1ii.cls"), "Wrong file returned");
        });

        test('Given a non-existent file, throws error', async () => {
            // ===== SETUP =====
            // Get a URI for a non-existent file.
            const fakeFilePath: string = path.join(codeFixturesPath, "folder a", "DefinitelyFakeClass.cls");
            const fakeFileUri: vscode.Uri = vscode.Uri.file(fakeFilePath);

            // ===== TEST =====
            // Feed the URI into the target finder, expecting an error.
            let err: Error = null;
            try {
                await getFilesFromSelection([fakeFileUri]);
            } catch (e) {
                err = e as Error;
            }
            // ===== ASSERTIONS =====
            // Expect that an error was thrown.
            // TODO: test error message instead of error existence.
            expect(err).to.not.be.null;
        });

        test('Given no selection, returns no files', async () => {
            // ===== SETUP =====
            // Open a file in the editor.
            const openFilePath: string = path.join(codeFixturesPath, 'folder a', 'MyClassA1.cls');
            const openFileUri: vscode.Uri = vscode.Uri.file(openFilePath);
            const doc: vscode.TextDocument = await vscode.workspace.openTextDocument(openFileUri);
            await vscode.window.showTextDocument(doc);

            // ===== TEST =====
            // Feed an empty array into the target finder.
            const targets: string[] = await getFilesFromSelection([]);

            // ===== ASSERTIONS =====
            expect(targets).to.have.lengthOf(0, 'Wrong nubmer of targets returned');
        });
    });
});
