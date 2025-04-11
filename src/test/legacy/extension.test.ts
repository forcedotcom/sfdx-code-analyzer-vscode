/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unused-expressions */ // TODO: Need to update these old tests... many of the chair assertions are not being used correctly causing eslint errors.
/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {expect} from 'chai';
import * as path from 'path';
import {SfCli} from '../../lib/sf-cli';
import * as Sinon from 'sinon';
import {
    _isValidFileForAnalysis,
    SFCAExtensionData
} from '../../extension';
import {messages} from '../../lib/messages';
import {SettingsManagerImpl} from '../../lib/settings';
import * as Constants from '../../lib/constants';
import * as targeting from '../../lib/targeting';
import * as vscode from 'vscode';
import {DiagnosticManager, DiagnosticManagerImpl} from '../../lib/diagnostics';
import {SpyLogger, StubTelemetryService} from "./test-utils";
import {DfaRunner, verifyPluginInstallation} from "../../lib/dfa-runner";
import {CodeAnalyzerRunAction} from "../../lib/code-analyzer-run-action";
import {CodeAnalyzer, CodeAnalyzerImpl} from "../../lib/code-analyzer";
import {TaskWithProgressRunner, TaskWithProgressRunnerImpl} from "../../lib/progress";
import {Display, VSCodeDisplay} from "../../lib/display";

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');
    // Note: Because this is a mocha test, __dirname here is actually the location of the js file in the out/test folder.
    const codeFixturesPath: string = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'code-fixtures');

    suite('E2E', function () {
        const ext: vscode.Extension<SFCAExtensionData> = vscode.extensions.getExtension('salesforce.sfdx-code-analyzer-vscode');
        suiteSetup(async function () {
            // Activate the extension.
            await ext.activate();
        });

        setup(function () {
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

            const extData: SFCAExtensionData = ext.exports;
            // Also, clear any diagnostics we added.
            extData.diagnosticManager.clearAllDiagnostics()
        });

        suite('sfca.runOnActiveFile', () => {
            const fileUri: vscode.Uri = vscode.Uri.file(path.join(codeFixturesPath, 'folder-a', 'MyClassA1.cls'));

            setup(async function() {
                // Open a file in the editor.
                const doc = await vscode.workspace.openTextDocument(fileUri);
                await vscode.window.showTextDocument(doc);
            });

            teardown(() => {
                Sinon.restore();
            });

            async function runTest(desiredV5EnablementStatus: boolean): Promise<void> {
                // ===== SETUP =====
                // Set V5's enablement to the desired state.
                Sinon.stub(SettingsManagerImpl.prototype, 'getCodeAnalyzerUseV4Deprecated').returns(!desiredV5EnablementStatus);

                // ===== TEST =====
                // Run the "scan active file" command.
                await vscode.commands.executeCommand('sfca.runOnActiveFile');

                // ===== ASSERTIONS =====
                // Verify that we added diagnostics.
                const diagnostics: vscode.Diagnostic[] = vscode.languages.getDiagnostics(fileUri);
                expect(diagnostics, 'Expected non-empty diagnostic array').to.not.be.empty;

                // At present, we expect only violations for PMD's `ApexDoc` rule.
                for (const diagnostic of diagnostics) {
                    expect(diagnostic.source).to.equal('pmd via Code Analyzer', 'Wrong source');
                    expect(diagnostic.code).to.have.property('value', 'ApexDoc', 'Wrong rule violated');
                    expect(diagnostic.code).to.have.property('target');
                    expect((diagnostic.code['target'] as vscode.Uri).scheme).to.equal('https');
                }
            }

            test('Adds proper diagnostics when running with v4', async function() {
                this.timeout(90000);
                await runTest(false);
            });

            test('Adds proper diagnostics when running with v5', async function() {
                this.timeout(90000);
                await runTest(true);
            });
        });

        suite('sfca.runOnSelected', () => {
            suite('One file selected', () => {
                // Get the URI for a single file.
                const targetUri: vscode.Uri = vscode.Uri.file(path.join(codeFixturesPath, 'folder-a', 'MyClassA1.cls'));

                teardown(() => {
                    Sinon.restore();
                });

                async function runTest(desiredV5EnablementStatus: boolean): Promise<void> {
                    // ===== SETUP =====
                    // Set V5's enablement to the desired state.
                    Sinon.stub(SettingsManagerImpl.prototype, 'getCodeAnalyzerUseV4Deprecated').returns(!desiredV5EnablementStatus);

                    // ===== TEST =====
                    // Run the "scan selected files" command.
                    // Pass the URI in as the first parameter, since that's what happens on a single-file selection.
                    await vscode.commands.executeCommand('sfca.runOnSelected', targetUri, []);

                    // ===== ASSERTIONS =====
                    // Verify that we added diagnostics.
                    const diagnostics: vscode.Diagnostic[] = vscode.languages.getDiagnostics(targetUri);
                    expect(diagnostics, `Expected non-empty diagnostics for ${targetUri.toString()}`).to.not.be.empty;
                    // At present, we expect only violations for PMD's `ApexDoc` rule.
                    for (const diagnostic of diagnostics) {
                        expect(diagnostic.source).to.equal('pmd via Code Analyzer', 'Wrong source');
                        expect(diagnostic.code).to.have.property('value', 'ApexDoc', 'Wrong rule violated');
                    }
                }

                test('Adds proper diagnostics when running with v4', async function() {
                    this.timeout(90000);
                    await runTest(false);
                });

                test('Adds proper diagnostics when running with v5', async function() {
                    this.timeout(90000);
                    await runTest(true);
                });
            });

            suite('One folder selected', () => {
                test('Adds proper diagnostics when running with v4', async function() {
                    // TODO: WRITE THIS TEST
                });

                test('Adds proper diagnostics when running with v5', async function() {
                    // TODO: WRITE THIS TEST
                });
            });

            suite('Multiple files selected', () => {
                // Get the URIs for two separate files.
                const targetUri1: vscode.Uri = vscode.Uri.file(path.join(codeFixturesPath, 'folder-a', 'MyClassA1.cls'));
                const targetUri2: vscode.Uri = vscode.Uri.file(path.join(codeFixturesPath, 'folder-a', 'MyClassA2.cls'));

                teardown(() => {
                    Sinon.restore();
                });

                async function runTest(desiredV5EnablementStatus: boolean): Promise<void> {
                    // ===== SETUP =====
                    // Set V5's enablement to the desired state.
                    Sinon.stub(SettingsManagerImpl.prototype, 'getCodeAnalyzerUseV4Deprecated').returns(!desiredV5EnablementStatus);

                    // ===== TEST =====
                    // Run the "scan selected files" command.
                    // Pass the URIs in as the second parameter, since that's what happens on a multi-select pick.
                    await vscode.commands.executeCommand('sfca.runOnSelected', null, [targetUri1, targetUri2]);


                    // ===== ASSERTIONS =====
                    // Verify that we added diagnostics.
                    const diagnostics1: vscode.Diagnostic[] = vscode.languages.getDiagnostics(targetUri1);
                    const diagnostics2: vscode.Diagnostic[] = vscode.languages.getDiagnostics(targetUri2);
                    expect(diagnostics1, `Expected non-empty diagnostics for ${targetUri1.toString()}`).to.not.be.empty;
                    expect(diagnostics2, `Expected non-empty diagnostics for ${targetUri2.toString()}`).to.not.be.empty;
                    // At present, we expect only violations for PMD's `ApexDoc` rule.
                    for (const diagnostic of [...diagnostics1, ...diagnostics2]) {
                        expect(diagnostic.source).to.equal('pmd via Code Analyzer', 'Wrong source');
                        expect(diagnostic.code).to.have.property('value', 'ApexDoc', 'Wrong rule violated');
                    }
                }

                test('Adds proper diagnostics when running with v4', async function() {
                    this.timeout(90000);
                    await runTest(false);
                });

                test('Adds proper diagnostics when running with v5', async function() {
                    this.timeout(90000);
                    await runTest(true);
                });
            });
        });

        test('sfca.runDfaOnSelected', async () => {
            // TODO: Add actual tests for `runDfaOnSelected`.
        });
    });

    suite('#_runAndDisplay()', () => {
        const ext: vscode.Extension<SFCAExtensionData> = vscode.extensions.getExtension('salesforce.sfdx-code-analyzer-vscode');
        let stubTelemetryService: StubTelemetryService;
        let codeAnalyzerRunAction: CodeAnalyzerRunAction;

        suiteSetup(async function () {
            // Activate the extension.
            await ext.activate();

            const diagnosticCollection: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection();

            stubTelemetryService = new StubTelemetryService();
            // TODO: I think we are finally at a place where we can stop using Sinon and instead use proper spies
            //       but leaving it to a later PR to transform this test to stop using VSCode* and Impl* classes
            //       and then we should be ready to move everything to be proper unit tests.
            const display: Display = new VSCodeDisplay(new SpyLogger());
            const taskWithProgressRunner: TaskWithProgressRunner = new TaskWithProgressRunnerImpl();
            const codeAnalyzer: CodeAnalyzer = new CodeAnalyzerImpl(new SettingsManagerImpl(), display);
            codeAnalyzerRunAction = new CodeAnalyzerRunAction(taskWithProgressRunner, codeAnalyzer, new DiagnosticManagerImpl(diagnosticCollection),
                stubTelemetryService, new SpyLogger(), new VSCodeDisplay(new SpyLogger()));
        });

        suite('Error handling', () => {
            teardown(() => {
                Sinon.restore();
            });

            test('Throws error if `sf`/`sfdx` is missing', async function () {
                this.timeout(90000);

                // ===== SETUP =====
                // Simulate SFDX being unavailable.
                const errorSpy = Sinon.spy(vscode.window, 'showErrorMessage');
                Sinon.stub(SfCli, 'isSfCliInstalled').resolves(false);
                const fakeTelemetryName = 'FakeName';

                // ===== TEST =====
                // Attempt to run the appropriate extension command.
                // The arguments do not matter.
                await codeAnalyzerRunAction.run(fakeTelemetryName, []);


                // ===== ASSERTIONS =====
                Sinon.assert.callCount(errorSpy, 1);
                expect(errorSpy.firstCall.args[0]).to.include(messages.error.sfMissing);
                const sentExceptions = stubTelemetryService.getSentExceptions();
                expect(sentExceptions.length).to.equal(1, 'Wrong number of exceptions sent');
                expect(sentExceptions[0].name).to.equal(Constants.TELEM_FAILED_STATIC_ANALYSIS, 'Wrong telemetry key');
                expect(sentExceptions[0].message).to.include(messages.error.sfMissing);
                expect(sentExceptions[0].data).to.haveOwnProperty('executedCommand', fakeTelemetryName, 'Wrong command name applied');
            });
        });
    });

    suite('#_runAndDisplayDfa()', () => {
        suite('Error handling', () => {
            teardown(() => {
                Sinon.restore();
            });

            test('Throws error if `sf`/`sfdx` is missing', async function () {
                this.timeout(90000);

                // ===== SETUP =====
                const stubTelemetryService: StubTelemetryService = new StubTelemetryService();
                // Simulate SF being unavailable.
                const errorSpy = Sinon.spy(vscode.window, 'showErrorMessage');
                Sinon.stub(SfCli, 'isSfCliInstalled').resolves(false);
                const fakeTelemetryName = 'FakeName';

                const context: vscode.ExtensionContext = null; // Not needed for this test, so just setting it to null
                const dfaRunner: DfaRunner = new DfaRunner(context, stubTelemetryService, new SpyLogger())

                // ===== TEST =====
                // Attempt to run the appropriate extension command.
                await dfaRunner._runAndDisplayDfa(fakeTelemetryName, null, ['someMethod'], 'some/project/dir');

                // ===== ASSERTIONS =====
                Sinon.assert.callCount(errorSpy, 1);
                expect(errorSpy.firstCall.args[0]).to.include(messages.error.sfMissing);
                const sentExceptions = stubTelemetryService.getSentExceptions();
                expect(sentExceptions.length).to.equal(1, 'Wrong number of exceptions sent');
                expect(sentExceptions[0].name).to.equal(Constants.TELEM_FAILED_DFA_ANALYSIS, 'Wrong telemetry key');
                expect(sentExceptions[0].message).to.include(messages.error.sfMissing);
                expect(sentExceptions[0].data).to.haveOwnProperty('executedCommand', fakeTelemetryName, 'Wrong command name applied');
            });

            test('Throws error if `sfdx-scanner` is missing', async function () {
                this.timeout(90000);

                // ===== SETUP =====
                const stubTelemetryService: StubTelemetryService = new StubTelemetryService();
                // Simulate SF being available but SFDX Scanner being absent.
                const errorSpy = Sinon.spy(vscode.window, 'showErrorMessage');
                Sinon.stub(SfCli, 'isSfCliInstalled').resolves(true);
                Sinon.stub(SfCli, 'isCodeAnalyzerInstalled').resolves(false);
                const fakeTelemetryName = 'FakeName';

                const context: vscode.ExtensionContext = null; // Not needed for this test, so just setting it to null
                const dfaRunner: DfaRunner = new DfaRunner(context, stubTelemetryService, new SpyLogger())

                // ===== TEST =====
                try {
                    await dfaRunner._runAndDisplayDfa(fakeTelemetryName, null, ['someMethod'], 'some/project/dir');
                } catch (_e) {
                    // Spy will check the error
                }

                // ===== ASSERTIONS =====
                Sinon.assert.callCount(errorSpy, 1);
                expect(errorSpy.firstCall.args[0]).to.include(messages.error.sfdxScannerMissing);
                const sentExceptions = stubTelemetryService.getSentExceptions();
                expect(sentExceptions.length).to.equal(1, 'Wrong number of exceptions');
                expect(sentExceptions[0].name).to.equal(Constants.TELEM_FAILED_DFA_ANALYSIS, 'Wrong telemetry key');
                expect(sentExceptions[0].message).to.include(messages.error.sfdxScannerMissing);
                expect(sentExceptions[0].data).to.haveOwnProperty('executedCommand', fakeTelemetryName, 'Wrong command name applied');
            });
        });
    });

    suite('#verifyPluginInstallation()', () => {
        teardown(() => {
            Sinon.restore();
        });

        test('Errors if `sfdx-scanner` is missing', async function () {
            this.timeout(90000);

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
                err = e as Error;
            }

            // ===== ASSERTIONS =====
            expect(err.message).to.include(messages.error.sfdxScannerMissing);
        });

        test('Errors if `cli` is missing', async function () {
            this.timeout(90000);

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
                err = e as Error;
            }

            // ===== ASSERTIONS =====
            expect(err.message).to.include(messages.error.sfMissing);
        });
    });

    suite('#_shouldProceedWithDfaRun()', () => {
        const ext: vscode.Extension<SFCAExtensionData> = vscode.extensions.getExtension('salesforce.sfdx-code-analyzer-vscode');
        let context: vscode.ExtensionContext;

        suiteSetup(async function () {
            // Activate the extension.
            const extData: SFCAExtensionData = await ext.activate();
            context = extData.context;
        });

        teardown(async () => {
            Sinon.restore();
            await context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);
        });

        test('Returns true and confirmation message not called when no existing DFA process detected', async function () {
            this.timeout(90000);

            const infoMessageSpy = Sinon.spy(vscode.window, 'showInformationMessage');

            await context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);

            const dfaRunner: DfaRunner = new DfaRunner(context, new StubTelemetryService(), new SpyLogger())

            expect(await dfaRunner.shouldProceedWithDfaRun()).to.equal(true);
            Sinon.assert.callCount(infoMessageSpy, 0);
        });

        test('Confirmation message called when DFA process detected', async function () {
            this.timeout(90000);

            const infoMessageSpy = Sinon.spy(vscode.window, 'showInformationMessage');
            await context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, 1234);

            const dfaRunner: DfaRunner = new DfaRunner(context, new StubTelemetryService(), new SpyLogger())

            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            dfaRunner.shouldProceedWithDfaRun();

            Sinon.assert.callCount(infoMessageSpy, 1);
            expect(infoMessageSpy.firstCall.args[0]).to.include(messages.graphEngine.existingDfaRunText);
        });
    });

    suite('#_stopExistingDfaRun()', function () {
        const ext: vscode.Extension<SFCAExtensionData> = vscode.extensions.getExtension('salesforce.sfdx-code-analyzer-vscode');
        let context: vscode.ExtensionContext;

        suiteSetup(async () => {
            // Activate the extension.
            const extData: SFCAExtensionData = await ext.activate();
            context = extData.context;
        });

        teardown(() => {
            void context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);
            Sinon.restore();
        });

        test('Cache cleared as part of stopping the existing DFA run', async function () {
            this.timeout(90000);

            context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, 1234);

            const dfaRunner: DfaRunner = new DfaRunner(context, new StubTelemetryService(), new SpyLogger())

            await dfaRunner.stopExistingDfaRun();
            expect(context.workspaceState.get(Constants.WORKSPACE_DFA_PROCESS)).to.be.undefined;
        });

        test('Cache stays cleared when there are no existing DFA runs', function () {
            this.timeout(90000);

            void context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);
            const dfaRunner: DfaRunner = new DfaRunner(context, new StubTelemetryService(), new SpyLogger())

            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            dfaRunner.stopExistingDfaRun();
            expect(context.workspaceState.get(Constants.WORKSPACE_DFA_PROCESS)).to.be.undefined;
        });
    });

    suite('#isValidFileForAnalysis', () => {
        test('Returns true for valid files', () => {
            // ===== SETUP ===== and ===== ASSERTIONS =====
            expect(_isValidFileForAnalysis(vscode.Uri.file("/some/path/file.apex"))).to.equal(true);
            expect(_isValidFileForAnalysis(vscode.Uri.file("/some/path/file.cls"))).to.equal(true);
            expect(_isValidFileForAnalysis(vscode.Uri.file("/some/path/file.trigger"))).to.equal(true);
            expect(_isValidFileForAnalysis(vscode.Uri.file("/some/path/file.ts"))).to.equal(true);
            expect(_isValidFileForAnalysis(vscode.Uri.file("/some/path/file.js"))).to.equal(true);
        });

        test('Returns false for invalid files', () => {
            // ===== SETUP ===== and ===== ASSERTIONS =====
            expect(_isValidFileForAnalysis(vscode.Uri.file("/some/path/file.java"))).to.equal(false);
            expect(_isValidFileForAnalysis(vscode.Uri.file("/some/path/file"))).to.equal(false);
        });
    });

    suite('_clearDiagnosticsForSelectedFiles Test Suite', () => {
        let diagnosticCollection: vscode.DiagnosticCollection;
        let getTargetsStub: Sinon.SinonStub;
        let diagnosticManager: DiagnosticManager;

        suiteSetup(() => {
            // Create a diagnostic collection before the test suite starts.
            diagnosticCollection = vscode.languages.createDiagnosticCollection();
            getTargetsStub = Sinon.stub(targeting, 'getFilesFromSelection');
        });

        setup(() => {
            // Ensure the diagnostic collection is clear before each test.
            diagnosticCollection.clear();

            diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);
        });

        teardown(() => {
            // Clear the diagnostic collection after each test.
            diagnosticCollection.clear();
            getTargetsStub.reset();
        });

        test('Should clear diagnostics for a single file', function () {
            this.timeout(90000);

            // ===== SETUP =====
            const uri = vscode.Uri.file('/some/path/file1.cls');
            const diagnostics = [
                new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'Test diagnostic', vscode.DiagnosticSeverity.Warning)
            ];
            diagnosticCollection.set(uri, diagnostics);
            getTargetsStub.returns(['/some/path/file1.cls']);

            expect(diagnosticCollection.get(uri)).to.have.lengthOf(1, 'Expected diagnostics to be present before clearing');

            // ===== TEST =====
            diagnosticManager.clearDiagnosticsForFiles([uri]);

            // ===== ASSERTIONS =====
            expect(diagnosticCollection.get(uri)).to.be.empty;
        });

        test('Should clear diagnostics for multiple files', function () {
            this.timeout(90000);

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
            diagnosticManager.clearDiagnosticsForFiles([uri1, uri2]);

            // ===== ASSERTIONS =====
            expect(diagnosticCollection.get(uri1)).to.be.empty;
            expect(diagnosticCollection.get(uri2)).to.be.empty;
        });

        test('Should handle case with no diagnostics to clear', function () {
            this.timeout(90000);

            // ===== SETUP =====
            const uri = vscode.Uri.file('/some/path/file4.cls');

            // ===== TEST =====
            diagnosticManager.clearDiagnosticsForFiles([uri]);

            // ===== ASSERTIONS =====
            expect(diagnosticCollection.get(uri)).to.be.empty;
        });

        test('Should handle case with an empty URI array', function () {
            this.timeout(90000);

            // ===== SETUP =====
            const uri = vscode.Uri.file('/some/path/file5.cls');
            const diagnostics = [
                new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'Test diagnostic', vscode.DiagnosticSeverity.Warning)
            ];
            diagnosticCollection.set(uri, diagnostics);
            getTargetsStub.returns([]);

            expect(diagnosticCollection.get(uri)).to.have.lengthOf(1, 'Expected diagnostics to be present before clearing');

            // ===== TEST =====
            diagnosticManager.clearDiagnosticsForFiles([]);

            // ===== ASSERTIONS =====
            expect(diagnosticCollection.get(uri)).to.have.lengthOf(1, 'Expected diagnostics to remain unchanged');
        });

        test('Should not affect other diagnostics not in the selected list', function () {
            this.timeout(90000);

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
            diagnosticManager.clearDiagnosticsForFiles([uri1]);

            // ===== ASSERTIONS =====
            expect(diagnosticCollection.get(uri1)).to.be.empty;
            expect(diagnosticCollection.get(uri2)).to.have.lengthOf(1, 'Expected diagnostics to remain unchanged');
        });
    });

    suite('_removeSingleDiagnostic Test Suite', () => {
        let diagnosticCollection: vscode.DiagnosticCollection;
        let diagnosticManager: DiagnosticManager;

        setup(() => {
            // Create a new diagnostic collection for each test
            diagnosticCollection = vscode.languages.createDiagnosticCollection();
            diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);
        });

        teardown(() => {
            // Clear the diagnostic collection after each test
            diagnosticCollection.clear();
        });

        test('Should remove a single diagnostic from the collection', function () {
            this.timeout(90000);

            // ===== SETUP =====
            const uri = vscode.Uri.file('/some/path/file1.cls');
            const diagnosticToRemove = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'Test diagnostic to remove', vscode.DiagnosticSeverity.Warning);
            const anotherDiagnostic = new vscode.Diagnostic(new vscode.Range(1, 0, 1, 5), 'Another diagnostic', vscode.DiagnosticSeverity.Error);

            // Set initial diagnostics
            diagnosticCollection.set(uri, [diagnosticToRemove, anotherDiagnostic]);

            expect(diagnosticCollection.get(uri)).to.have.lengthOf(2, 'Expected two diagnostics to be present before removal');

            // ===== TEST =====
            diagnosticManager.clearDiagnosticsInRange(uri, diagnosticToRemove.range);

            // ===== ASSERTIONS =====
            const remainingDiagnostics = diagnosticCollection.get(uri);
            expect(remainingDiagnostics).to.have.lengthOf(1, 'Expected one diagnostic to remain after removal');
            expect(remainingDiagnostics[0].message).to.equal('Another diagnostic', 'Expected the remaining diagnostic to be the one not removed');
        });

        test('Should handle removing a diagnostic from an empty collection', function () {
            this.timeout(90000);

            // ===== SETUP =====
            const uri = vscode.Uri.file('/some/path/file2.cls');
            const diagnosticToRemove = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'Test diagnostic to remove', vscode.DiagnosticSeverity.Warning);

            expect(diagnosticCollection.get(uri)).to.be.empty;

            // ===== TEST =====
            diagnosticManager.clearDiagnosticsInRange(uri, diagnosticToRemove.range);

            // ===== ASSERTIONS =====
            const remainingDiagnostics = diagnosticCollection.get(uri);
            expect(remainingDiagnostics).to.be.empty;
        });

        test('Should handle case where diagnostic is not found', function () {
            this.timeout(90000);

            // ===== SETUP =====
            const uri = vscode.Uri.file('/some/path/file3.cls');
            const diagnosticToRemove = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'Test diagnostic to remove', vscode.DiagnosticSeverity.Warning);
            const existingDiagnostic = new vscode.Diagnostic(new vscode.Range(1, 0, 1, 5), 'Existing diagnostic', vscode.DiagnosticSeverity.Error);

            // Set initial diagnostics
            diagnosticCollection.set(uri, [existingDiagnostic]);

            expect(diagnosticCollection.get(uri)).to.have.lengthOf(1, 'Expected one diagnostic to be present before attempting removal');

            // ===== TEST =====
            diagnosticManager.clearDiagnosticsInRange(uri, diagnosticToRemove.range);

            // ===== ASSERTIONS =====
            const remainingDiagnostics = diagnosticCollection.get(uri);
            expect(remainingDiagnostics).to.have.lengthOf(1, 'Expected the diagnostic collection to remain unchanged');
            expect(remainingDiagnostics[0].message).to.equal('Existing diagnostic', 'Expected the existing diagnostic to remain unchanged');
        });
    });

});
