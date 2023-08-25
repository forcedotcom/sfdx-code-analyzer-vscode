/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as assert from 'assert';
import {expect} from 'chai';
import {SfCli} from '../../lib/sf-cli';
import Sinon = require('sinon');
import { _runAndDisplayPathless, _runAndDisplayDfa } from '../../extension';
import {messages} from '../../lib/messages';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

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
