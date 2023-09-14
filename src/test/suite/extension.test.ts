/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as assert from 'assert';
import {expect} from 'chai';
import path = require('path');
import {SfCli} from '../../lib/sf-cli';
import Sinon = require('sinon');
import { _runAndDisplayPathless, _runAndDisplayDfa, _clearDiagnostics } from '../../extension';
import {messages} from '../../lib/messages';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');
	// Note: __dirname is used here because it's consistent across file systems.
	const codeFixturesPath: string = path.resolve(__dirname, '..', '..', '..', 'code-fixtures');

	suite('E2E', () => {
		let ext = vscode.extensions.getExtension('salesforce.sfdx-code-analyzer-vscode');
		let context: vscode.ExtensionContext;
		suiteSetup(async () => {
			// Activate the extension.
			context = await ext.activate();
		});

		setup(() => {
			// Verify that there are no existing diagnostics floating around.
			const diagnosticsArrays = vscode.languages.getDiagnostics();
			for (const [uri, diagnostics] of diagnosticsArrays) {
				expect(diagnostics, `${uri.toString()} should start without diagnostics`).to.be.empty;
			}
		});

		teardown(async () => {
			// Close any open tabs and close the active editor.
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
			// Also, clear any diagnostics we added.
			_clearDiagnostics();
		});

		// The use of `this.timeout` requires us to use `function() {}` syntax instead of arrow functions.
		// (Arrow functions bind lexical `this` and we don't want that.)
		test('sfca.runOnActiveFile', async function() {
			// ===== SETUP =====
			// Set the timeout to a frankly absurd value, just to make sure Github Actions
			// can finish it in time.
			this.timeout(60000);
			// Open a file in the editor.
			const fileUri: vscode.Uri = vscode.Uri.file(path.join(codeFixturesPath, 'folder-a', 'MyClassA1.cls'));
			const doc = await vscode.workspace.openTextDocument(fileUri);
			await vscode.window.showTextDocument(doc);

			// ===== TEST =====
			// Run the "scan active file" command.
			await vscode.commands.executeCommand('sfca.runOnActiveFile');

			// ===== ASSERTIONS =====
			// Verify that we added diagnostics.
			const diagnosticArrays = vscode.languages.getDiagnostics();
			const [uri, diagnostics] = diagnosticArrays.find(uriDiagPair => uriDiagPair[0].toString() === fileUri.toString());
			expect(uri, `Expected diagnostics for ${fileUri.toString()}`).to.exist;
			expect(diagnostics, 'Expected non-empty diagnostic array').to.not.be.empty;

			// At present, we expect only violations for PMD's `ApexDoc` rule.
			for (const diagnostic of diagnostics) {
				expect(diagnostic.source).to.equal('pmd via Code Analyzer', 'Wrong source');
				expect(diagnostic.code).to.have.property('value', 'ApexDoc', 'Wrong rule violated');
			}
		});

		test('sfca.runOnSelected', async function() {
			// TODO: Add actual tests for `runOnSelected`.


		});

		test('sfca.runDfaOnSelected', async () => {
			// TODO: Add actual tests for `runDfaOnSelected`.
		});
	});

	suite('#_runAndDisplayPathless()', () => {
		suite('Error handling', () => {
			const outputChannel: vscode.LogOutputChannel = vscode.window.createOutputChannel('sfca', {log: true});
			outputChannel.clear();
			teardown(() => {
				Sinon.restore();
			});

			test('Throws error if `sf`/`sfdx` is missing', async () => {
				// ===== SETUP =====
				// Simulate SFDX being unavailable.
				const errorSpy = Sinon.spy(vscode.window, 'showErrorMessage');
				Sinon.stub(SfCli, 'isSfCliInstalled').resolves(false);

				// ===== TEST =====
				// Attempt to run the appropriate extension command.
				// The arguments do not matter.
				await _runAndDisplayPathless(null, null, outputChannel);

				// ===== ASSERTIONS =====
				Sinon.assert.callCount(errorSpy, 1);
				expect(errorSpy.firstCall.args[0]).to.include(messages.error.sfMissing);
			});

			test('Throws error if `sfdx-scanner` is missing', async () => {
				// ===== SETUP =====
				// Simulate SFDX being available but SFDX Scanner being absent.
				const errorSpy = Sinon.spy(vscode.window, 'showErrorMessage');
				Sinon.stub(SfCli, 'isSfCliInstalled').resolves(true);
				Sinon.stub(SfCli, 'isCodeAnalyzerInstalled').resolves(false);

				// ===== TEST =====
				// Attempt to run the appropriate extension command.
				// The arguments do not matter.
				await _runAndDisplayPathless(null, null, outputChannel);

				// ===== ASSERTIONS =====
				Sinon.assert.callCount(errorSpy, 1);
				expect(errorSpy.firstCall.args[0]).to.include(messages.error.sfdxScannerMissing);
			});
		});
	});

	suite('#_runAndDisplayDfa()', () => {
		suite('Error handling', () => {
			const statusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
			const outputChannel: vscode.LogOutputChannel = vscode.window.createOutputChannel('sfca', {log: true});
			outputChannel.clear();
			teardown(() => {
				Sinon.restore();
			});

			test('Throws error if `sf`/`sfdx` is missing', async () => {
				// ===== SETUP =====
				// Simulate SFDX being unavailable.
				const errorSpy = Sinon.spy(vscode.window, 'showErrorMessage');
				Sinon.stub(SfCli, 'isSfCliInstalled').resolves(false);

				// ===== TEST =====
				// Attempt to run the appropriate extension command.
				await _runAndDisplayDfa(statusBar, outputChannel);

				// ===== ASSERTIONS =====
				Sinon.assert.callCount(errorSpy, 1);
				expect(errorSpy.firstCall.args[0]).to.include(messages.error.sfMissing);
			});

			test('Throws error if `sfdx-scanner` is missing', async () => {
				// ===== SETUP =====
				// Simulate SFDX being available but SFDX Scanner being absent.
				const errorSpy = Sinon.spy(vscode.window, 'showErrorMessage');
				Sinon.stub(SfCli, 'isSfCliInstalled').resolves(true);
				Sinon.stub(SfCli, 'isCodeAnalyzerInstalled').resolves(false);

				// ===== TEST =====
				// Attempt to run the appropriate extension command, expecting an error.
				let err: Error = null;
				try {
					await _runAndDisplayDfa(statusBar, outputChannel);
				} catch (e) {
					err = e;
				}

				// ===== ASSERTIONS =====
				Sinon.assert.callCount(errorSpy, 1);
				expect(errorSpy.firstCall.args[0]).to.include(messages.error.sfdxScannerMissing);
			});
		});
	});
});
