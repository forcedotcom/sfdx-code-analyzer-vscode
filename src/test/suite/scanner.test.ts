/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import Sinon = require('sinon');
import path = require('path');
import {expect} from 'chai';
import {SettingsManager} from '../../lib/settings';
import {messages} from '../../lib/messages';
import * as File from '../../lib/file';
import {ScanRunner} from '../../lib/scanner';
import * as vscode from 'vscode';
import * as Constants from '../../lib/constants';

import {ExecutionResult, RuleResult} from '../../types';

suite('ScanRunner', () => {
    suite('#createPathlessArgArray()', () => {
        // Create a list of fake targets to use in our tests.
        const targets: string[] = [
            'these',
            'are',
            'all',
            'dummy',
            'targets'
        ];
        function invokeTestedMethod(): Promise<string[]> {
            // ===== SETUP =====
            // Create a scan runner.
            const scanner: ScanRunner = new ScanRunner();

            // ===== TEST =====
            // Use the scan runner on our target list to create and return our arg array.
            return (scanner as any).createPathlessArgArray(targets);
        }

        suite('Non Custom PMD Config, with various parameter options', () => {
            teardown(() => {
                // Revert any stubbing we did with Sinon.
                Sinon.restore();
            });

            test('Creates array-ified sfdx-scanner command', async () => {
                // ===== SETUP =====
                // Stub out the appropriate SettingsManager methods.
                Sinon.stub(SettingsManager, 'getEslintEngine').returns("");
                Sinon.stub(SettingsManager, 'getRulesCategory').returns("");
                Sinon.stub(SettingsManager, 'getNormalizeSeverityEnabled').returns(false);
                
                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = await invokeTestedMethod();

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args).to.have.lengthOf(7, 'Wrong number of args');
                expect(args[0]).to.equal('scanner', 'Wrong arg');
				expect(args[1]).to.equal('run', 'Wrong arg');
                expect(args[2]).to.equal('--target', 'Wrong arg');
                expect(args[3]).to.equal(targets.join(','), 'Wrong arg');
                expect(args[4]).to.equal('--engine', 'Wrong arg');
                expect(args[5]).to.equal('retire-js,pmd', 'Wrong arg');
                expect(args[6]).to.equal('--json', 'Wrong arg');
            });

            test('Includes eslintEngine in the --engine parameter if provided', async () => {
                // ===== SETUP =====
                // Stub out the appropriate SettingsManager methods.
                const eslintEngine = 'eslint';
                Sinon.stub(SettingsManager, 'getEslintEngine').returns(eslintEngine);
                Sinon.stub(SettingsManager, 'getRulesCategory').returns("");
                Sinon.stub(SettingsManager, 'getNormalizeSeverityEnabled').returns(false);
    
                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = await invokeTestedMethod();
    
                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args).to.have.lengthOf(7, 'Wrong number of args');
                expect(args[0]).to.equal('scanner', 'Wrong arg');
                expect(args[1]).to.equal('run', 'Wrong arg');
                expect(args[2]).to.equal('--target', 'Wrong arg');
                expect(args[3]).to.equal(targets.join(','), 'Wrong arg');
                expect(args[4]).to.equal('--engine', 'Wrong arg');
                expect(args[5]).to.equal('retire-js,pmd,eslint', 'Wrong arg');
                expect(args[6]).to.equal('--json', 'Wrong arg');
            });

            test('Includes rulesCategory in the --category parameter if provided', async () => {
                // ===== SETUP =====
                // Stub out the appropriate SettingsManager methods.
                const ruleCategory = 'security';
                Sinon.stub(SettingsManager, 'getRulesCategory').returns(ruleCategory);
                Sinon.stub(SettingsManager, 'getNormalizeSeverityEnabled').returns(false);
    
                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = await invokeTestedMethod();
    
                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                // expect(args).to.have.lengthOf(9, 'Wrong number of args');
                expect(args[7]).to.equal('--category', 'Wrong arg');
                expect(args[8]).to.equal(ruleCategory, 'Wrong arg');
            });

            test('Includes --normalize-severity parameter if flag enabled', async () => {
                // ===== SETUP =====
                // Stub out the appropriate SettingsManager methods.
                Sinon.stub(SettingsManager, 'getNormalizeSeverityEnabled').returns(true);
    
                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = await invokeTestedMethod();
    
                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                // expect(args).to.have.lengthOf(9, 'Wrong number of args');
                expect(args[7]).to.equal('--normalize-severity', 'Wrong arg');
            });
        });

        suite('Custom PMD config', () => {
            teardown(() => {
                // Revert any stubbing we did with Sinon.
                Sinon.restore();
            });

            test('When custom PMD config exists, it is included in the array', async () => {
                // ===== SETUP =====
                // Stub out the appropriate SettingsManager and File methods to simulate the existence
                // of a real config file.
                const dummyConfigPath: string = '/Users/me/someconfig.xml';
                Sinon.stub(SettingsManager, 'getPmdCustomConfigFile').returns(dummyConfigPath);
                Sinon.stub(File, 'exists').resolves(true);
                Sinon.stub(SettingsManager, 'getEslintEngine').returns('');

                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = await invokeTestedMethod();

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args).to.have.lengthOf(9, 'Wrong number of args');
                expect(args[0]).to.equal('scanner', 'Wrong arg');
				expect(args[1]).to.equal('run', 'Wrong arg');
                expect(args[2]).to.equal('--target', 'Wrong arg');
                expect(args[3]).to.equal(targets.join(','), 'Wrong arg');
                expect(args[4]).to.equal('--engine', 'Wrong arg');
                expect(args[5]).to.equal('retire-js,pmd', 'Wrong arg');
                expect(args[6]).to.equal('--json', 'Wrong arg');
                expect(args[7]).to.equal('--pmdconfig', 'Wrong arg');
                expect(args[8]).to.equal(dummyConfigPath, 'Wrong arg');
            });

            test('When custom PMD config is non-existent, an error is thrown', async () => {
                // ===== SETUP =====
                // Stub out the appropriate SettingsManager method to simulate the non-existence of
                // a config file.
                const dummyConfigPath: string = '/Users/me/someconfig.xml';
                Sinon.stub(SettingsManager, 'getPmdCustomConfigFile').returns(dummyConfigPath);
                Sinon.stub(File, 'exists').resolves(false);

                // ===== TEST =====
                // Call the test method helper, expecting an exception.
                let err: Error = null;
                try {
                    const args: string[] = await invokeTestedMethod();
                } catch (e) {
                    err = e;
                }

                // ===== ASSERTIONS =====
                expect(err).to.exist;
                expect(err.message).to.equal(messages.error.pmdConfigNotFoundGenerator(dummyConfigPath), 'Wrong error message');

            });

            test('When custom PMD config is empty string, it is not included in the array', async () => {
                // ===== SETUP =====
                // Stub out the appropriate SettingsManager method to return an empty string.
                Sinon.stub(SettingsManager, 'getPmdCustomConfigFile').returns("");
                Sinon.stub(SettingsManager, 'getEslintEngine').returns('');

                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = await invokeTestedMethod();

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args).to.have.lengthOf(7, 'Wrong number of args');
                expect(args[0]).to.equal('scanner', 'Wrong arg');
				expect(args[1]).to.equal('run', 'Wrong arg');
                expect(args[2]).to.equal('--target', 'Wrong arg');
                expect(args[3]).to.equal(targets.join(','), 'Wrong arg');
                expect(args[4]).to.equal('--engine', 'Wrong arg');
                expect(args[5]).to.equal('retire-js,pmd', 'Wrong arg');
                expect(args[6]).to.equal('--json', 'Wrong arg');
            });
        });
    });

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
        function invokeTestedMethod(): string[] {
            // ===== SETUP =====
            // Create a scan runner.
            const scanner: ScanRunner = new ScanRunner();

            // ===== TEST =====
            // Use the scan runner on our target list to create and return our arg array.
            const args: string[] = (scanner as any).createDfaArgArray(targets, projectDir);

            // ===== ASSERTIONS =====
            // Perform the validations common to all cases.
            expect(args).to.have.length.of.at.least(10, 'Wrong number of args');
            expect(args[0]).to.equal('scanner', 'Wrong arg');
			expect(args[1]).to.equal('run', 'Wrong arg');
			expect(args[2]).to.equal('dfa', 'Wrong arg');
            expect(args[3]).to.equal('--target', 'Wrong arg');
            expect(args[4]).to.equal(targets.join(','), 'Wrong arg');
            expect(args[5]).to.equal('--projectdir', 'Wrong arg');
            expect(args[6]).to.equal(projectDir, 'Wrong arg');
            expect(args[7]).to.equal('--format', 'Wrong arg');
            expect(args[8]).to.equal('html', 'Wrong arg');
            expect(args[9]).to.equal('--json', 'Wrong arg');

            return args;
        }

        suite('Simple cases', () => {
            teardown(() => {
                // Revert any stubbing we did with Sinon.
                Sinon.restore();
            });

            test('Creates array-ified sfdx-scanner dfa command', () => {
                // ===== SETUP =====
                // Stub out all the settings methods to return null/false values.
                Sinon.stub(SettingsManager, 'getGraphEngineDisableWarningViolations').returns(false);
                Sinon.stub(SettingsManager, 'getGraphEngineThreadTimeout').returns(null);
                Sinon.stub(SettingsManager, 'getGraphEnginePathExpansionLimit').returns(null);
                Sinon.stub(SettingsManager, 'getGraphEngineJvmArgs').returns(null);

                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = invokeTestedMethod();

                // ===== ASSERTIONS =====
                // Assert we got the right number of args. Everything else has been checked already.
                expect(args).to.have.lengthOf(10, 'Wrong number of args');
            });
        });

        suite('Settings values', () => {
            teardown(() => {
                // Revert any stubbing we did with Sinon.
                Sinon.restore();
            });

            test('Disable Warning Violations', () => {
                // ===== SETUP =====
                // Stub the Disable Warning Violations method to return true.
                Sinon.stub(SettingsManager, 'getGraphEngineDisableWarningViolations').returns(true);
                // Stub out the other settings methods to return null/false values.
                Sinon.stub(SettingsManager, 'getGraphEngineThreadTimeout').returns(null);
                Sinon.stub(SettingsManager, 'getGraphEnginePathExpansionLimit').returns(null);
                Sinon.stub(SettingsManager, 'getGraphEngineJvmArgs').returns(null);

                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = invokeTestedMethod();

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args).to.have.lengthOf(11, 'Wrong number of args');
                expect(args[10]).to.equal('--rule-disable-warning-violation', 'Wrong arg');
            });

            test('Thread Timeout', () => {
                // ===== SETUP =====
                // Stub out the Thread Timeout method to return some unusual number.
                const timeout: number = 234123;
                Sinon.stub(SettingsManager, 'getGraphEngineThreadTimeout').returns(timeout);
                // Stub out the other settings methods to return null/false values.
                Sinon.stub(SettingsManager, 'getGraphEngineDisableWarningViolations').returns(false);
                Sinon.stub(SettingsManager, 'getGraphEnginePathExpansionLimit').returns(null);
                Sinon.stub(SettingsManager, 'getGraphEngineJvmArgs').returns(null);

                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = invokeTestedMethod();

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args).to.have.lengthOf(12, 'Wrong number of args');
                expect(args[10]).to.equal('--rule-thread-timeout', 'Wrong arg');
                expect(args[11]).to.equal(`${timeout}`, 'Wrong arg');
            });

            test('Path Expansion Limit', () => {
                // ===== SETUP =====
                // Stub out the Path Expansion Limit method to return some unusual number.
                const limit: number = 38832;
                Sinon.stub(SettingsManager, 'getGraphEnginePathExpansionLimit').returns(limit);
                // Stub out the other settings methods to return null/false values.
                Sinon.stub(SettingsManager, 'getGraphEngineDisableWarningViolations').returns(false);
                Sinon.stub(SettingsManager, 'getGraphEngineThreadTimeout').returns(null);
                Sinon.stub(SettingsManager, 'getGraphEngineJvmArgs').returns(null);

                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = invokeTestedMethod();

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args).to.have.lengthOf(12, 'Wrong number of args');
                expect(args[10]).to.equal('--pathexplimit', 'Wrong arg');
                expect(args[11]).to.equal(`${limit}`, 'Wrong arg');
            });

            test('JVM Args', () => {
                // ===== SETUP =====
                // Stub out the JVM Args method to return some non-standard value.
                const jvmArgs = '-Xmx25g';
                Sinon.stub(SettingsManager, 'getGraphEngineJvmArgs').returns(jvmArgs);
                // Stub out the other settings methods to return null/false values.
                Sinon.stub(SettingsManager, 'getGraphEngineDisableWarningViolations').returns(false);
                Sinon.stub(SettingsManager, 'getGraphEngineThreadTimeout').returns(null);
                Sinon.stub(SettingsManager, 'getGraphEnginePathExpansionLimit').returns(null);

                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = invokeTestedMethod();

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args).to.have.lengthOf(12, 'Wrong number of args');
                expect(args[10]).to.equal('--sfgejvmargs', 'Wrong arg');
                expect(args[11]).to.equal(jvmArgs, 'Wrong arg');
            });
        });
    });

    suite('#processPathlessResults()', () => {
        test('Returns violations found during successful scan', () => {
            // ===== SETUP =====
            // Create a spoofed result with some violations.
            const spoofedOutput: ExecutionResult = {
                status: 0,
                result: [{
                    engine: "pmd",
                    fileName: "fakefile1",
                    violations: [{
                        ruleName: "fakeRule1",
                        message: "fake message",
                        severity: 0,
                        category: "fake category",
                        line: 1,
                        column: 5,
                        endLine: 5,
                        endColumn: 50
                    }]
                }, {
                    engine: "retire-js",
                    fileName: "fakefile2",
                    violations: [{
                        ruleName: "fakeRule2",
                        message: "fake message",
                        severity: 0,
                        category: "fake category",
                        line: 1,
                        column: 5,
                        endLine: 5,
                        endColumn: 50
                    }]
                }]
            };

            // ===== TEST =====
            // Feed the results into the processor.
            const scanner = new ScanRunner();
            const processedResults: RuleResult[] = (scanner as any).processPathlessResults(spoofedOutput);

            // ===== ASSERTIONS =====
            // Verify that the right number of results were returned.
            expect(processedResults).to.have.lengthOf(2, 'Wrong number of results returned');
        });

        test('Returns empty array after violation-less scan', () => {
            // ===== SETUP =====
            // Create spoofed result without any violations.
            const spoofedOutput: ExecutionResult = {
                status: 0,
                // TODO: This string may change with time.
                result: "Executed engines: pmd, retire-js. No rule violations found"
            };

            // ===== TEST =====
            // Feed the results into the processor.
            const scanner = new ScanRunner();
            const processedResults: RuleResult[] = (scanner as any).processPathlessResults(spoofedOutput);

            // ===== ASSERTIONS =====
            // Verify that the right number of results were returned.
            expect(processedResults).to.have.lengthOf(0, 'Wrong number of results returned');
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
                const processedResults: RuleResult[] = (scanner as any).processPathlessResults(spoofedOutput);
            } catch (e) {
                err = e;
            }

            // ===== ASSERTIONS =====
            expect(err).to.exist;
            expect(err.message).to.equal(spoofedOutput.message);
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
                const processedResults: string = (scanner as any).processDfaResults(spoofedOutput);
            } catch (e) {
                err = e;
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
                const processedResults: string = (scanner as any).processDfaResults(spoofedOutput);
            } catch (e) {
                err = e;
            }

            // ===== ASSERTIONS =====
            expect(err).to.exist;
            expect(err.message).to.equal(spoofedOutput.message);
        });
    });

    suite('#invokeDfaAnalyzer()', () => {
        let ext = vscode.extensions.getExtension('salesforce.sfdx-code-analyzer-vscode');
		let context: vscode.ExtensionContext;

		suiteSetup(async function () {
			this.timeout(10000);
			// Activate the extension.
			context = await ext.activate();
		});

        test('Adds process Id to the cache', () => {
            // ===== SETUP =====
            const args:string[] = [];
            const scanner = new ScanRunner();
            void context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);

            // ===== TEST =====
            (scanner as any).invokeDfaAnalyzer(args, context);

            // ===== ASSERTIONS =====
            expect(context.workspaceState.get(Constants.WORKSPACE_DFA_PROCESS)).to.be.not.undefined;
        });
    });

    suite('#invokeAnalyzer()', () => {
        let ext = vscode.extensions.getExtension('salesforce.sfdx-code-analyzer-vscode');
		let context: vscode.ExtensionContext;

		suiteSetup(async function () {
			this.timeout(10000);
			// Activate the extension.
			context = await ext.activate();
		});
    });
});