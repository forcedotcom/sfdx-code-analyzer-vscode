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
import { _runAndDisplayPathless, _runAndDisplayDfa, _clearDiagnostics, _shouldProceedWithDfaRun, _stopExistingDfaRun, _isValidFileForAnalysis, verifyPluginInstallation, _clearDiagnosticsForSelectedFiles, _removeDiagnosticsInRange, RunInfo } from '../../extension';
import {messages} from '../../lib/messages';
import {CoreExtensionService, TelemetryService} from '../../lib/core-extension-service';
import * as Constants from '../../lib/constants';
import * as targeting from '../../lib/targeting';

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
		suiteSetup(async function () {
			this.timeout(10000);
			// Activate the extension.
			context = await ext.activate();
		});

		setup(function () {
			this.timeout(10000);
			// Verify that there are no existing diagnostics floating around.
			const diagnosticsArrays = vscode.languages.getDiagnostics();
			for (const [uri, diagnostics] of diagnosticsArrays) {
				expect(diagnostics, `${uri.toString()} should start without diagnostics`).to.be.empty;
			}
			// Set custom settings
			const configuration = vscode.workspace.getConfiguration();
			configuration.update('codeAnalyzer.scanner.engines', 'pmd,retire-js,eslint-lwc', vscode.ConfigurationTarget.Global);
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
			this.timeout(90000);
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
				expect(diagnostic.code).to.have.property('target');
				expect((diagnostic.code['target'] as vscode.Uri).scheme).to.equal('https');
			}
		});

		suite('sfca.runOnSelected', () => {
			test('One file selected', async function() {
				// ===== SETUP =====
				// Set the timeout to a frankly absurd value, just to make sure Github Actions
				// can finish it in time.
				this.timeout(60000);
				// Get the URI for a single file.
				const targetUri: vscode.Uri = vscode.Uri.file(path.join(codeFixturesPath, 'folder-a', 'MyClassA1.cls'));

				// ===== TEST =====
				// Run the "scan selected files" command.
				// Pass the URI in as the first parameter, since that's what happens on a single-file selection.
				await vscode.commands.executeCommand('sfca.runOnSelected', targetUri, []);

				// ===== ASSERTIONS =====
				// Verify that we added diagnostics.
				const diagnosticArrays = vscode.languages.getDiagnostics();
				const [resultsUri, diagnostics] = diagnosticArrays.find(uriDiagPair => uriDiagPair[0].toString() === targetUri.toString());
				expect(resultsUri, `Expected diagnostics for ${targetUri.toString()}`).to.exist;
				expect(diagnostics, `Expected non-empty diagnostics for ${targetUri.toString()}`).to.not.be.empty;
				// At present, we expect only violations for PMD's `ApexDoc` rule.
				for (const diagnostic of diagnostics) {
					expect(diagnostic.source).to.equal('pmd via Code Analyzer', 'Wrong source');
					expect(diagnostic.code).to.have.property('value', 'ApexDoc', 'Wrong rule violated');
				}
			});

			test('One folder selected', () => {
				// TODO: IMPLEMENT THIS TEST
			});

			test('Multiple files selected', async function() {
				// ===== SETUP =====
				// Set the timeout to a frankly absurd value, just to make sure Github Actions
				// can finish it in time.
				this.timeout(60000);
				// Get the URIs for two separate files.
				const targetUri1: vscode.Uri = vscode.Uri.file(path.join(codeFixturesPath, 'folder-a', 'MyClassA1.cls'));
				const targetUri2: vscode.Uri = vscode.Uri.file(path.join(codeFixturesPath, 'folder-a', 'MyClassA2.cls'));

				// ===== TEST =====
				// Run the "scan selected files" command.
				// Pass the URIs in as the second parameter, since that's what happens on a multi-select pick.
				await vscode.commands.executeCommand('sfca.runOnSelected', null, [targetUri1, targetUri2]);

				// ===== ASSERTIONS =====
				// Verify that we added diagnostics.
				const diagnosticArrays = vscode.languages.getDiagnostics();
				const [resultsUri1, diagnostics1] = diagnosticArrays.find(uriDiagPair => uriDiagPair[0].toString() === targetUri1.toString());
				const [resultsUri2, diagnostics2] = diagnosticArrays.find(uriDiagPair => uriDiagPair[0].toString() === targetUri2.toString());
				expect(resultsUri1, `Expected diagnostics for ${targetUri1.toString()}`).to.exist;
				expect(resultsUri2, `Expected diagnostics for ${targetUri2.toString()}`).to.exist;
				expect(diagnostics1, `Expected non-empty diagnostics for ${targetUri1.toString()}`).to.not.be.empty;
				expect(diagnostics2, `Expected non-empty diagnostics for ${targetUri2.toString()}`).to.not.be.empty;
				// At present, we expect only violations for PMD's `ApexDoc` rule.
				for (const diagnostic of [...diagnostics1, ...diagnostics2]) {
					expect(diagnostic.source).to.equal('pmd via Code Analyzer', 'Wrong source');
					expect(diagnostic.code).to.have.property('value', 'ApexDoc', 'Wrong rule violated');
				}
			});
		});

		test('sfca.runDfaOnSelected', async () => {
			// TODO: Add actual tests for `runDfaOnSelected`.
		});
	});

	suite('#_runAndDisplayPathless()', () => {
		suite('Error handling', () => {
			let commandTelemStub: Sinon.SinonStub;
			let exceptionTelemStub: Sinon.SinonStub;
			setup(() => {
				commandTelemStub = Sinon.stub(TelemetryService, 'sendCommandEvent').callsFake(() => {});
				exceptionTelemStub = Sinon.stub(TelemetryService, 'sendException').callsFake(() => {});
			});

			teardown(() => {
				Sinon.restore();
			});

			test('Throws error if `sf`/`sfdx` is missing', async () => {
				// ===== SETUP =====
				// Simulate SFDX being unavailable.
				const errorSpy = Sinon.spy(vscode.window, 'showErrorMessage');
				Sinon.stub(SfCli, 'isSfCliInstalled').resolves(false);
				const fakeTelemetryName = 'FakeName';

				// ===== TEST =====
				// Attempt to run the appropriate extension command.
				// The arguments do not matter.
				await _runAndDisplayPathless(null, {
					commandName: fakeTelemetryName
				});

				// ===== ASSERTIONS =====
				Sinon.assert.callCount(errorSpy, 1);
				expect(errorSpy.firstCall.args[0]).to.include(messages.error.sfMissing);
				Sinon.assert.callCount(exceptionTelemStub, 1);
				expect(exceptionTelemStub.firstCall.args[0]).to.equal(Constants.TELEM_FAILED_STATIC_ANALYSIS, 'Wrong telemetry key');
				expect(exceptionTelemStub.firstCall.args[1]).to.include(messages.error.sfMissing);
				expect(exceptionTelemStub.firstCall.args[2]).to.haveOwnProperty('executedCommand', fakeTelemetryName, 'Wrong command name applied');
			});

			test('Throws error if `sfdx-scanner` is missing', async () => {
				// ===== SETUP =====
				// Simulate SFDX being available but SFDX Scanner being absent.
				const errorSpy = Sinon.spy(vscode.window, 'showErrorMessage');
				Sinon.stub(SfCli, 'isSfCliInstalled').resolves(true);
				Sinon.stub(SfCli, 'isCodeAnalyzerInstalled').resolves(false);
				const fakeTelemetryName = 'FakeName';

				// ===== TEST =====
				// Attempt to run the appropriate extension command.
				// The arguments do not matter.
				await _runAndDisplayPathless(null, {
					commandName: fakeTelemetryName
				});

				// ===== ASSERTIONS =====
				Sinon.assert.callCount(errorSpy, 1);
				expect(errorSpy.firstCall.args[0]).to.include(messages.error.sfdxScannerMissing);
				Sinon.assert.callCount(exceptionTelemStub, 1);
				expect(exceptionTelemStub.firstCall.args[0]).to.equal(Constants.TELEM_FAILED_STATIC_ANALYSIS, 'Wrong telemetry key');
				expect(exceptionTelemStub.firstCall.args[1]).to.include(messages.error.sfdxScannerMissing);
				expect(exceptionTelemStub.firstCall.args[2]).to.haveOwnProperty('executedCommand', fakeTelemetryName, 'Wrong command name applied');
			});
		});
	});

	suite('#_runAndDisplayDfa()', () => {
		suite('Error handling', () => {
			let commandTelemStub: Sinon.SinonStub;
			let exceptionTelemStub: Sinon.SinonStub;

			setup(() => {
				commandTelemStub = Sinon.stub(TelemetryService, 'sendCommandEvent').callsFake(() => {});
				exceptionTelemStub = Sinon.stub(TelemetryService, 'sendException').callsFake(() => {});
			});

			teardown(() => {
				Sinon.restore();
			});

			test('Throws error if `sf`/`sfdx` is missing', async () => {
				// ===== SETUP =====
				// Simulate SF being unavailable.
				const errorSpy = Sinon.spy(vscode.window, 'showErrorMessage');
				Sinon.stub(SfCli, 'isSfCliInstalled').resolves(false);
				const fakeTelemetryName = 'FakeName';

				// ===== TEST =====
				// Attempt to run the appropriate extension command.
				await _runAndDisplayDfa(null, {
					commandName: fakeTelemetryName
				}, null, 'someMethod', 'some/project/dir');

				// ===== ASSERTIONS =====
				Sinon.assert.callCount(errorSpy, 1);
				expect(errorSpy.firstCall.args[0]).to.include(messages.error.sfMissing);
				Sinon.assert.callCount(exceptionTelemStub, 1);
				expect(exceptionTelemStub.firstCall.args[0]).to.equal(Constants.TELEM_FAILED_DFA_ANALYSIS, 'Wrong telemetry key');
				expect(exceptionTelemStub.firstCall.args[1]).to.include(messages.error.sfMissing);
				expect(exceptionTelemStub.firstCall.args[2]).to.haveOwnProperty('executedCommand', fakeTelemetryName, 'Wrong command name applied');
			});

			test('Throws error if `sfdx-scanner` is missing', async () => {
				// ===== SETUP =====
				// Simulate SF being available but SFDX Scanner being absent.
				const errorSpy = Sinon.spy(vscode.window, 'showErrorMessage');
				Sinon.stub(SfCli, 'isSfCliInstalled').resolves(true);
				Sinon.stub(SfCli, 'isCodeAnalyzerInstalled').resolves(false);
				const fakeTelemetryName = 'FakeName';

				// ===== TEST =====
				// Attempt to run the appropriate extension command, expecting an error.
				let err: Error = null;
				try {
					await _runAndDisplayDfa(null, {
						commandName: fakeTelemetryName
					}, null, 'someMethod', 'some/project/dir');
				} catch (e) {
					err = e;
				}

				// ===== ASSERTIONS =====
				Sinon.assert.callCount(errorSpy, 1);
				expect(errorSpy.firstCall.args[0]).to.include(messages.error.sfdxScannerMissing);
				Sinon.assert.callCount(exceptionTelemStub, 1);
				expect(exceptionTelemStub.firstCall.args[0]).to.equal(Constants.TELEM_FAILED_DFA_ANALYSIS, 'Wrong telemetry key');
				expect(exceptionTelemStub.firstCall.args[1]).to.include(messages.error.sfdxScannerMissing);
				expect(exceptionTelemStub.firstCall.args[2]).to.haveOwnProperty('executedCommand', fakeTelemetryName, 'Wrong command name applied');
			});
		});
	});

	suite('#verifyPluginInstallation()', () => {
		teardown(() => {
			Sinon.restore();
		});

		test('Errors if `sfdx-scanner` is missing', async () => {
			// ===== SETUP =====
			// Simulate SF being available but SFDX Scanner being absent.
			Sinon.stub(SfCli, 'isSfCliInstalled').resolves(true);
			Sinon.stub(SfCli, 'isCodeAnalyzerInstalled').resolves(false);

			// ===== TEST =====
			// Attempt to run the appropriate extension command, expecting an error.
			let err: Error = null;
			try {
				await verifyPluginInstallation();
			} catch (e) {
				err = e;
			}

			// ===== ASSERTIONS =====
			expect(err.message).to.include(messages.error.sfdxScannerMissing);
		});

		test('Errors if `cli` is missing', async () => {
			// ===== SETUP =====
			// Simulate SF being available but SFDX Scanner being absent.
			Sinon.stub(SfCli, 'isSfCliInstalled').resolves(false);
			Sinon.stub(SfCli, 'isCodeAnalyzerInstalled').resolves(true);

			// ===== TEST =====
			// Attempt to run the appropriate extension command, expecting an error.
			let err: Error = null;
			try {
				await verifyPluginInstallation();
			} catch (e) {
				err = e;
			}

			// ===== ASSERTIONS =====
			expect(err.message).to.include(messages.error.sfMissing);
		});
	});

	suite('#_shouldProceedWithDfaRun()', () => {
		let ext = vscode.extensions.getExtension('salesforce.sfdx-code-analyzer-vscode');
		let context: vscode.ExtensionContext;

		suiteSetup(async function () {
			this.timeout(10000);
			// Activate the extension.
			context = await ext.activate();
		});

		teardown(async () => {
			Sinon.restore();
			await context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);
		});

		test('Returns true and confirmation message not called when no existing DFA process detected', async() => {
			const infoMessageSpy = Sinon.spy(vscode.window, 'showInformationMessage');
			
			await context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);

			expect(await _shouldProceedWithDfaRun(context)).to.equal(true);
			Sinon.assert.callCount(infoMessageSpy, 0);
		});

		test('Confirmation message called when DFA process detected', async() => {
			const infoMessageSpy = Sinon.spy(vscode.window, 'showInformationMessage');
			await context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, 1234);

			_shouldProceedWithDfaRun(context);

			Sinon.assert.callCount(infoMessageSpy, 1);
			expect(infoMessageSpy.firstCall.args[0]).to.include(messages.graphEngine.existingDfaRunText);
		});
	});

	suite('#_stopExistingDfaRun()', () => {
        let ext = vscode.extensions.getExtension('salesforce.sfdx-code-analyzer-vscode');
        let context: vscode.ExtensionContext;

        suiteSetup(async function () {
            this.timeout(10000);
            // Activate the extension.
            context = await ext.activate();
        });

        teardown(async () => {
            void context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);
            Sinon.restore();
        });

        test('Cache cleared as part of stopping the existing DFA run', async() => {
            context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, 1234);
			_stopExistingDfaRun(context);
            expect(context.workspaceState.get(Constants.WORKSPACE_DFA_PROCESS)).to.be.undefined;
        });

        test('Cache stays cleared when there are no existing DFA runs', async() => {
            void context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);
            _stopExistingDfaRun(context);
            expect(context.workspaceState.get(Constants.WORKSPACE_DFA_PROCESS)).to.be.undefined;
        });
    });

	suite('#isValidFileForAnalysis', () => {
		test('Returns true for valid files', async() => {
			// ===== SETUP ===== and ===== ASSERTIONS =====
			expect(_isValidFileForAnalysis(vscode.Uri.file("/some/path/file.apex"))).to.equal(true);
			expect(_isValidFileForAnalysis(vscode.Uri.file("/some/path/file.cls"))).to.equal(true);
			expect(_isValidFileForAnalysis(vscode.Uri.file("/some/path/file.trigger"))).to.equal(true);
			expect(_isValidFileForAnalysis(vscode.Uri.file("/some/path/file.ts"))).to.equal(true);
			expect(_isValidFileForAnalysis(vscode.Uri.file("/some/path/file.js"))).to.equal(true);
		});

		test('Returns false for invalid files', async() => {
			// ===== SETUP ===== and ===== ASSERTIONS =====
			expect(_isValidFileForAnalysis(vscode.Uri.file("/some/path/file.java"))).to.equal(false);
			expect(_isValidFileForAnalysis(vscode.Uri.file("/some/path/file"))).to.equal(false);
		});
	});

	suite('_clearDiagnosticsForSelectedFiles Test Suite', () => {
		let diagnosticCollection: vscode.DiagnosticCollection;
		let runInfo: RunInfo;
		let getTargetsStub: Sinon.SinonStub;
	
		suiteSetup(() => {
			// Create a diagnostic collection before the test suite starts.
			diagnosticCollection = vscode.languages.createDiagnosticCollection();
			runInfo = {
				commandName: Constants.COMMAND_REMOVE_DIAGNOSTICS_ON_ACTIVE_FILE,
				diagnosticCollection
			};
			getTargetsStub = Sinon.stub(targeting, 'getTargets');
		});
	
		setup(() => {
			// Ensure the diagnostic collection is clear before each test.
			diagnosticCollection.clear();
		});
	
		teardown(() => {
			// Clear the diagnostic collection after each test.
			diagnosticCollection.clear();
			getTargetsStub.reset();
		});
	
		test('Should clear diagnostics for a single file', async () => {
			// ===== SETUP =====
			const uri = vscode.Uri.file('/some/path/file1.cls');
			const diagnostics = [
				new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'Test diagnostic', vscode.DiagnosticSeverity.Warning)
			];
			runInfo.diagnosticCollection.set(uri, diagnostics);
			getTargetsStub.returns(['/some/path/file1.cls']);
	
			expect(runInfo.diagnosticCollection.get(uri)).to.have.lengthOf(1, 'Expected diagnostics to be present before clearing');
	
			// ===== TEST =====
			await _clearDiagnosticsForSelectedFiles([uri], runInfo);

			// ===== ASSERTIONS =====
			expect(runInfo.diagnosticCollection.get(uri)).to.be.empty;
		});
	
		test('Should clear diagnostics for multiple files', async () => {
			// ===== SETUP =====
			const uri1 = vscode.Uri.file('/some/path/file2.cls');
			const uri2 = vscode.Uri.file('/some/path/file3.cls');
			const diagnostics = [
				new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'Test diagnostic', vscode.DiagnosticSeverity.Warning)
			];
			diagnosticCollection.set(uri1, diagnostics);
			diagnosticCollection.set(uri2, diagnostics);
			getTargetsStub.returns(['/some/path/file2.cls', '/some/path/file3.cls']);
	
			expect(diagnosticCollection.get(uri1)).to.have.lengthOf(1, 'Expected diagnostics to be present before clearing');
			expect(diagnosticCollection.get(uri2)).to.have.lengthOf(1, 'Expected diagnostics to be present before clearing');
	
			// ===== TEST =====
			await _clearDiagnosticsForSelectedFiles([uri1, uri2], runInfo);

			// ===== ASSERTIONS =====
			expect(runInfo.diagnosticCollection.get(uri1)).to.be.empty;
			expect(runInfo.diagnosticCollection.get(uri2)).to.be.empty;
		});
	
		test('Should handle case with no diagnostics to clear', async () => {
			// ===== SETUP =====
			const uri = vscode.Uri.file('/some/path/file4.cls');
	
			// ===== TEST =====
			await _clearDiagnosticsForSelectedFiles([uri], runInfo);
	
			// ===== ASSERTIONS =====
			expect(runInfo.diagnosticCollection.get(uri)).to.be.empty;
		});
	
		test('Should handle case with an empty URI array', async () => {
			// ===== SETUP =====
			const uri = vscode.Uri.file('/some/path/file5.cls');
			const diagnostics = [
				new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'Test diagnostic', vscode.DiagnosticSeverity.Warning)
			];
			diagnosticCollection.set(uri, diagnostics);
			getTargetsStub.returns([]);

			expect(diagnosticCollection.get(uri)).to.have.lengthOf(1, 'Expected diagnostics to be present before clearing');
	
			// ===== TEST =====
			await _clearDiagnosticsForSelectedFiles([], runInfo);
	
			// ===== ASSERTIONS =====
			expect(runInfo.diagnosticCollection.get(uri)).to.have.lengthOf(1, 'Expected diagnostics to remain unchanged');
		});
	
		test('Should not affect other diagnostics not in the selected list', async () => {
			// ===== SETUP =====
			const uri1 = vscode.Uri.file('/some/path/file6.cls');
			const uri2 = vscode.Uri.file('/some/path/file7.cls');
			const diagnostics1 = [
				new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'Test diagnostic', vscode.DiagnosticSeverity.Warning)
			];
			const diagnostics2 = [
				new vscode.Diagnostic(new vscode.Range(1, 0, 1, 5), 'Another test diagnostic', vscode.DiagnosticSeverity.Error)
			];
			diagnosticCollection.set(uri1, diagnostics1);
			diagnosticCollection.set(uri2, diagnostics2);
			getTargetsStub.returns(['/some/path/file6.cls']);
	
			expect(diagnosticCollection.get(uri1)).to.have.lengthOf(1, 'Expected diagnostics to be present before clearing');
			expect(diagnosticCollection.get(uri2)).to.have.lengthOf(1, 'Expected diagnostics to be present before clearing');
	
			// ===== TEST =====
			await _clearDiagnosticsForSelectedFiles([uri1], runInfo);
	
			// ===== ASSERTIONS =====
			expect(runInfo.diagnosticCollection.get(uri1)).to.be.empty;
			expect(runInfo.diagnosticCollection.get(uri2)).to.have.lengthOf(1, 'Expected diagnostics to remain unchanged');
		});
	});

	suite('_removeSingleDiagnostic Test Suite', () => {
		let diagnosticCollection: vscode.DiagnosticCollection;
	
		setup(() => {
			// Create a new diagnostic collection for each test
			diagnosticCollection = vscode.languages.createDiagnosticCollection();
		});
	
		teardown(() => {
			// Clear the diagnostic collection after each test
			diagnosticCollection.clear();
		});
	
		test('Should remove a single diagnostic from the collection', () => {
			// ===== SETUP =====
			const uri = vscode.Uri.file('/some/path/file1.cls');
			const diagnosticToRemove = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'Test diagnostic to remove', vscode.DiagnosticSeverity.Warning);
			const anotherDiagnostic = new vscode.Diagnostic(new vscode.Range(1, 0, 1, 5), 'Another diagnostic', vscode.DiagnosticSeverity.Error);
	
			// Set initial diagnostics
			diagnosticCollection.set(uri, [diagnosticToRemove, anotherDiagnostic]);
	
			expect(diagnosticCollection.get(uri)).to.have.lengthOf(2, 'Expected two diagnostics to be present before removal');
	
			// ===== TEST =====
			_removeDiagnosticsInRange(uri, diagnosticToRemove.range, diagnosticCollection);
	
			// ===== ASSERTIONS =====
			const remainingDiagnostics = diagnosticCollection.get(uri);
			expect(remainingDiagnostics).to.have.lengthOf(1, 'Expected one diagnostic to remain after removal');
			expect(remainingDiagnostics[0].message).to.equal('Another diagnostic', 'Expected the remaining diagnostic to be the one not removed');
		});
	
		test('Should handle removing a diagnostic from an empty collection', () => {
			// ===== SETUP =====
			const uri = vscode.Uri.file('/some/path/file2.cls');
			const diagnosticToRemove = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'Test diagnostic to remove', vscode.DiagnosticSeverity.Warning);
	
			expect(diagnosticCollection.get(uri)).to.be.empty;
	
			// ===== TEST =====
			_removeDiagnosticsInRange(uri, diagnosticToRemove.range, diagnosticCollection);
	
			// ===== ASSERTIONS =====
			const remainingDiagnostics = diagnosticCollection.get(uri);
			expect(remainingDiagnostics).to.be.empty;
		});
	
		test('Should handle case where diagnostic is not found', () => {
			// ===== SETUP =====
			const uri = vscode.Uri.file('/some/path/file3.cls');
			const diagnosticToRemove = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'Test diagnostic to remove', vscode.DiagnosticSeverity.Warning);
			const existingDiagnostic = new vscode.Diagnostic(new vscode.Range(1, 0, 1, 5), 'Existing diagnostic', vscode.DiagnosticSeverity.Error);
	
			// Set initial diagnostics
			diagnosticCollection.set(uri, [existingDiagnostic]);
	
			expect(diagnosticCollection.get(uri)).to.have.lengthOf(1, 'Expected one diagnostic to be present before attempting removal');
	
			// ===== TEST =====
			_removeDiagnosticsInRange(uri, diagnosticToRemove.range, diagnosticCollection);
	
			// ===== ASSERTIONS =====
			const remainingDiagnostics = diagnosticCollection.get(uri);
			expect(remainingDiagnostics).to.have.lengthOf(1, 'Expected the diagnostic collection to remain unchanged');
			expect(remainingDiagnostics[0].message).to.equal('Existing diagnostic', 'Expected the existing diagnostic to remain unchanged');
		});
	});
	
});
