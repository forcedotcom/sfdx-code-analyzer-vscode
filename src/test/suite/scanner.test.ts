/* eslint-disable @typescript-eslint/no-unused-expressions */ // TODO: Need to update these old tests... many of the chair assertions are not being used correctly causing eslint errors.
/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as path from 'path';
import {expect} from 'chai';
import {SettingsManager} from '../../lib/settings';
import {ScanRunner} from '../../lib/scanner';
import * as vscode from 'vscode';
import * as Constants from '../../lib/constants';

import {ExecutionResult} from '../../types';

suite('ScanRunner', () => {

    suite('#createDfaArgArray()', () => {
        // Create a list of fake t argets to use in our tests.
        const targets: string[] = [
            'these',
            'are',
            'all',
            'dummy',
            'targets'
        ];
        // Create a fake projectdir value for our tests too.
        const projectDir: string = path.join('this', 'path', 'does', 'not', 'matter');
        function invokeTestedMethod(settingsManager: StubSettingsManager): string[] {
            // ===== SETUP =====
            // Create a scan runner.
            const scanner: ScanRunner = new ScanRunner(settingsManager);

            // ===== TEST =====
            // Use the scan runner on our target list to create and return our arg array.
            
            /* eslint-disable-next-line */ // TODO: Wow - using "any" here to somehow get access to a private method. Why is this test written this way?
            const args: string[] = (scanner as any).createDfaArgArray(targets, projectDir);

            // ===== ASSERTIONS =====
            // Perform the validations common to all cases.
            expect(args).to.have.length.of.at.least(10, 'Wrong number of args');
            expect(args[0]).to.equal('scanner', 'Wrong arg');
			expect(args[1]).to.equal('run', 'Wrong arg');
			expect(args[2]).to.equal('dfa', 'Wrong arg');
            expect(args[3]).to.equal('--projectdir', 'Wrong arg');
            expect(args[4]).to.equal(projectDir, 'Wrong arg');
            expect(args[5]).to.equal('--format', 'Wrong arg');
            expect(args[6]).to.equal('html', 'Wrong arg');
            expect(args[7]).to.equal('--json', 'Wrong arg');
            expect(args[8]).to.equal('--target', 'Wrong arg');
            expect(args[9]).to.equal(targets.join(','), 'Wrong arg');


            return args;
        }

        suite('Simple cases', () => {

            test('Creates array-ified sfdx-scanner dfa command', () => {
                // ===== SETUP =====
                // Stub out all the settings methods to return null/false values.
				const settingsManager: StubSettingsManager = new StubSettingsManager();
				settingsManager.setGraphEngineDisableWarningViolations(false);
				settingsManager.setGraphEngineThreadTimeout(null);
				settingsManager.setGraphEnginePathExpansionLimit(null);
				settingsManager.setGraphEngineJvmArgs(null);

                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = invokeTestedMethod(settingsManager);

                // ===== ASSERTIONS =====
                // Assert we got the right number of args. Everything else has been checked already.
                expect(args).to.have.lengthOf(10, 'Wrong number of args');
            });
        });

        suite('Settings values', () => {

            test('Ignore target when it is empty', () => {
                // ===== SETUP =====
				const settingsManager: StubSettingsManager = new StubSettingsManager();
				settingsManager.setGraphEngineDisableWarningViolations(false);
				settingsManager.setGraphEngineThreadTimeout(null);
				settingsManager.setGraphEnginePathExpansionLimit(null);
				settingsManager.setGraphEngineJvmArgs(null);
                const emptyTargets = [];

                // ===== TEST =====
                // Call the test method helper.
                const scanner: ScanRunner = new ScanRunner(settingsManager);
                /* eslint-disable-next-line */ // TODO: Wow - using "any" here to somehow get access to a private method. Why is this test written this way?
                const args: string[] = (scanner as any).createDfaArgArray(emptyTargets, projectDir);

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args).to.not.include('--target', '--target should be ignored when empty');
            });

            test('Ignore target when it contains only null entries', () => {
                // ===== SETUP =====
				const settingsManager: StubSettingsManager = new StubSettingsManager();
				settingsManager.setGraphEngineDisableWarningViolations(false);
				settingsManager.setGraphEngineThreadTimeout(null);
				settingsManager.setGraphEnginePathExpansionLimit(null);
				settingsManager.setGraphEngineJvmArgs(null);
                const emptyTargets = [null];

                // ===== TEST =====
                // Call the test method helper.
                const scanner: ScanRunner = new ScanRunner(settingsManager);
                /* eslint-disable-next-line */ // TODO: Wow - using "any" here to somehow get access to a private method. Why is this test written this way?
                const args: string[] = (scanner as any).createDfaArgArray(emptyTargets, projectDir);

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args).to.not.include('--target', '--target should be ignored when it contains null entry');
            });

            test('Disable Warning Violations', () => {
                // ===== SETUP =====
				const settingsManager: StubSettingsManager = new StubSettingsManager();
				// Stub the Disable Warning Violations method to return true.
				settingsManager.setGraphEngineDisableWarningViolations(true);
				// Stub out the other settings methods to return null/false values.
				settingsManager.setGraphEngineThreadTimeout(null);
				settingsManager.setGraphEnginePathExpansionLimit(null);
				settingsManager.setGraphEngineJvmArgs(null);

                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = invokeTestedMethod(settingsManager);

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args).to.have.lengthOf(11, 'Wrong number of args');
                expect(args[10]).to.equal('--rule-disable-warning-violation', 'Wrong arg');
            });

            test('Thread Timeout', () => {
                // ===== SETUP =====
				const settingsManager: StubSettingsManager = new StubSettingsManager();
				// Stub out the Thread Timeout method to return some unusual number.
                const timeout: number = 234123;
				settingsManager.setGraphEngineThreadTimeout(timeout);
				// Stub out the other settings methods to return null/false values.
				settingsManager.setGraphEngineDisableWarningViolations(false);
				settingsManager.setGraphEnginePathExpansionLimit(null);
				settingsManager.setGraphEngineJvmArgs(null);

                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = invokeTestedMethod(settingsManager);

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args).to.have.lengthOf(12, 'Wrong number of args');
                expect(args[10]).to.equal('--rule-thread-timeout', 'Wrong arg');
                expect(args[11]).to.equal(`${timeout}`, 'Wrong arg');
            });

            test('Path Expansion Limit', () => {
                // ===== SETUP =====
				const settingsManager: StubSettingsManager = new StubSettingsManager();
				// Stub out the Path Expansion Limit method to return some unusual number.
                const limit: number = 38832;
				settingsManager.setGraphEnginePathExpansionLimit(limit);
				// Stub out the other settings methods to return null/false values.
				settingsManager.setGraphEngineThreadTimeout(null);
				settingsManager.setGraphEngineDisableWarningViolations(false);
				settingsManager.setGraphEngineJvmArgs(null);

                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = invokeTestedMethod(settingsManager);

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args).to.have.lengthOf(12, 'Wrong number of args');
                expect(args[10]).to.equal('--pathexplimit', 'Wrong arg');
                expect(args[11]).to.equal(`${limit}`, 'Wrong arg');
            });

            test('JVM Args', () => {
                // ===== SETUP =====
				const settingsManager: StubSettingsManager = new StubSettingsManager();
                // Stub out the JVM Args method to return some non-standard value.
				const jvmArgs = '-Xmx25g';
				settingsManager.setGraphEngineJvmArgs(jvmArgs);
                // Stub out the other settings methods to return null/false values.
				settingsManager.setGraphEngineDisableWarningViolations(false);
				settingsManager.setGraphEngineThreadTimeout(null);
				settingsManager.setGraphEnginePathExpansionLimit(null);

                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = invokeTestedMethod(settingsManager);

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args).to.have.lengthOf(12, 'Wrong number of args');
                expect(args[10]).to.equal('--sfgejvmargs', 'Wrong arg');
                expect(args[11]).to.equal(jvmArgs, 'Wrong arg');
            });

            test('Enable caching and include cache path', () => {
                // ===== SETUP =====
				const settingsManager: StubSettingsManager = new StubSettingsManager();
				settingsManager.setGraphEngineDisableWarningViolations(false);
				settingsManager.setGraphEngineThreadTimeout(null);
				settingsManager.setGraphEnginePathExpansionLimit(null);
				settingsManager.setGraphEngineJvmArgs(null);
                const emptyTargets = [];

                // ===== TEST =====
                // Call the test method helper.
                const scanner: ScanRunner = new ScanRunner(settingsManager);
                /* eslint-disable-next-line */ // TODO: Wow - using "any" here to somehow get access to a private method. Why is this test written this way?c
                const args: string[] = (scanner as any).createDfaArgArray(emptyTargets, projectDir, 'some/path/file.json');

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args).to.have.lengthOf(11, 'Wrong number of args');
                expect(args[8]).to.equal('--cachepath', 'Wrong arg');
                expect(args[9]).to.equal('some/path/file.json', 'Wrong arg');
                expect(args[10]).to.equal('--enablecaching', 'Wrong arg');
            });
        });
    });

    /**
     * NOTE: This entire section should be considered temporary.
     * The current implementation of DFA support is merely tentative,
     * and extremely likely to change as we move closer to going GA.
     */
    suite('#processDfaResults()', () => {
        test('Returns HTML-formatted violations after successful scan', () => {
            // ===== SETUP =====
            // Create spoofed result with some HTML output.
            const spoofedOutput: ExecutionResult = {
                status: 0,
                result: `<!DOCTYPE html><html></html>`
            };

            // ===== TEST =====
            // Feed the results into the processor.
            const scanner = new ScanRunner();
            /* eslint-disable-next-line */ // TODO: Wow - using "any" here to somehow get access to a private method. Why is this test written this way?
            const processedResults: string = (scanner as any).processDfaResults(spoofedOutput);

            // ===== ASSERTIONS =====
            // Verify that the html output was returned unchanged.
            expect(processedResults).to.equal(spoofedOutput.result, 'Wrong results returned');
        });

        test('Returns empty string after violation-less scan', () => {
            // ===== SETUP =====
            // Create spoofed results without any violations.
            const spoofedOutput: ExecutionResult = {
                status: 0,
                // TODO: This may change with time.
                result: "Executed engines: sfge. No rule violations found."
            };

            // ===== TEST =====
            // Feed the results into the processor.
            const scanner = new ScanRunner();
            /* eslint-disable-next-line */ // TODO: Wow - using "any" here to somehow get access to a private method. Why is this test written this way?
            const processedResults: string = (scanner as any).processDfaResults(spoofedOutput);

            // ===== ASSERTIONS =====
            // Verify that an empty string was returned.
            expect(processedResults).to.equal("", "Expected empty string");
        });

        test('Escalates method-not-found warning to error', () => {
            // ===== SETUP =====
            // Create spoofed output including a warning about a targeted method
            // not being found.
            const spoofedOutput: ExecutionResult = {
                status: 0,
                result: "Executed engines: sfge. No rule violations found.",
                warnings: [
                    "We're continually improving Salesforce Code Analyzer. Tell us what you think! Give feedback at https://research.net/r/SalesforceCA",
                    "No methods in file /this/path/does/not/matter/MySourceFile.cls matched name #notARealMethod()"
                ]
            };

            // ===== TEST =====
            // Feed the output into the processor, expecting the warning
            // to be escalated to an error.
            const scanner = new ScanRunner();
            let err: Error = null;
            try {
                /* eslint-disable-next-line */ // TODO: Wow - using "any" here to somehow get access to a private method. Why is this test written this way?
                (scanner as any).processDfaResults(spoofedOutput);
            } catch (e) {
                err = e as Error;
            }

            // ===== ASSERTIONS =====
            expect(err).to.exist;
            expect(err.message).to.equal(spoofedOutput.warnings[1]);
        });

        test('Throws error message from failed scan', () => {
            // ===== SETUP =====
            // Create spoofed output indicating an error.
            const spoofedOutput: ExecutionResult = {
                status: 50,
                message: "Some error occurred. OH NO!"
            };

            // ===== TEST =====
            // Feed the output into the processor, expecting an error.
            const scanner = new ScanRunner();
            let err: Error = null;
            try {
                /* eslint-disable-next-line */ // TODO: Wow - using "any" here to somehow get access to a private method. Why is this test written this way?
                (scanner as any).processDfaResults(spoofedOutput);
            } catch (e) {
                err = e as Error;
            }

            // ===== ASSERTIONS =====
            expect(err).to.exist;
            expect(err.message).to.equal(spoofedOutput.message);
        });
    });

    suite('#invokeDfaAnalyzer()', () => {
        const ext = vscode.extensions.getExtension('salesforce.sfdx-code-analyzer-vscode');
		let context: vscode.ExtensionContext;

		suiteSetup(async function () {
			this.timeout(10000);
			// Activate the extension.
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			context = await ext.activate();
		});

        test('Adds process Id to the cache', () => {
            // ===== SETUP =====
            const args:string[] = [];
            const scanner = new ScanRunner();
            void context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);

            // ===== TEST =====
            /* eslint-disable-next-line */ // TODO: Wow - using "any" here to somehow get access to a private method. Why is this test written this way?
            (scanner as any).invokeDfaAnalyzer(args, context);

            // ===== ASSERTIONS =====
            expect(context.workspaceState.get(Constants.WORKSPACE_DFA_PROCESS)).to.be.not.undefined;
        });
    });
});

class StubSettingsManager implements SettingsManager {
	private graphEngineDisableWarningViolations: boolean = false;
	private graphEngineThreadTimeout: number = 900000;
	private graphEnginePathExpansionLimit: number = null;
	private graphEngineJvmArgs: string = null;

	constructor() {
		this.resetSettings();
	}

	public resetSettings(): void {
		this.graphEngineDisableWarningViolations = false;
		this.graphEngineThreadTimeout = 900000;
		this.graphEnginePathExpansionLimit = null;
		this.graphEngineJvmArgs = null;
	}

	getCodeAnalyzerV5Enabled(): boolean {
		throw new Error('Method not implemented.');
	}

	getCodeAnalyzerTags(): string {
		throw new Error('Method not implemented');
	}

	getPmdCustomConfigFile(): string {
		throw new Error('Method not implemented.');
	}

	setGraphEngineDisableWarningViolations(b: boolean): void {
		this.graphEngineDisableWarningViolations = b;
	}

	getGraphEngineDisableWarningViolations(): boolean {
		return this.graphEngineDisableWarningViolations;
	}

	setGraphEngineThreadTimeout(n: number): void {
		this.graphEngineThreadTimeout = n;
	}

	getGraphEngineThreadTimeout(): number {
		return this.graphEngineThreadTimeout;
	}

	setGraphEnginePathExpansionLimit(n: number): void {
		this.graphEnginePathExpansionLimit = n;
	}

	getGraphEnginePathExpansionLimit(): number {
		return this.graphEnginePathExpansionLimit;
	}

	setGraphEngineJvmArgs(s: string): void {
		this.graphEngineJvmArgs = s;
	}

	getGraphEngineJvmArgs(): string {
		return this.graphEngineJvmArgs;
	}

	getAnalyzeOnSave(): boolean {
		throw new Error('Method not implemented.');
	}

	getAnalyzeOnOpen(): boolean {
		throw new Error('Method not implemented.');
	}

	getEnginesToRun(): string {
		throw new Error('Method not implemented.');
	}

	getNormalizeSeverityEnabled(): boolean {
		throw new Error('Method not implemented.');
	}

	getRulesCategory(): string {
		throw new Error('Method not implemented.');
	}

	getApexGuruEnabled(): boolean {
		throw new Error('Method not implemented.');
	}

	getSfgePartialSfgeRunsEnabled(): boolean {
		throw new Error('Method not implemented.');
	}

}
