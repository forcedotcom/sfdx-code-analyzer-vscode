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
import { Inputs } from '@salesforce/sfdx-scanner/lib/types';
import {RunAction} from '@salesforce/sfdx-scanner/lib/lib/actions/RunAction';

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

        suite('Simple cases', () => {
            test('Creates array-ified sfdx-scanner command', async () => {
                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = await invokeTestedMethod();

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                // expect(args).to.have.lengthOf(3, 'Wrong number of args');

                expect(args['target']).to.equal(targets, 'Wrong arg');
                expect(args['engine']).to.equal('pmd,retire-js', 'Wrong arg');
                expect(args['format']).to.equal('json', 'Wrong arg');
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

                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = await invokeTestedMethod();

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args['target']).to.equal(targets, 'Wrong arg');
                expect(args['engine']).to.equal('pmd,retire-js', 'Wrong arg');
                expect(args['format']).to.equal('json', 'Wrong arg');
                expect(args['pmdconfig']).to.equal(dummyConfigPath, 'Wrong arg');
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

                // ===== TEST =====
                // Call the test method helper.
                const args: string[] = await invokeTestedMethod();

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args['target']).to.equal(targets, 'Wrong arg');
                expect(args['engine']).to.equal('pmd,retire-js', 'Wrong arg');
                expect(args['format']).to.equal('json', 'Wrong arg');
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
        function invokeTestedMethod(): Inputs {
            // ===== SETUP =====
            // Create a scan runner.
            const scanner: ScanRunner = new ScanRunner();

            // ===== TEST =====
            // Use the scan runner on our target list to create and return our arg array.
            const args: Inputs = (scanner as any).createDfaArgArray(targets, projectDir);

            // ===== ASSERTIONS =====
            // Perform the validations common to all cases.
            expect(args['target']).to.equal(targets, 'Wrong arg');
            expect(args['projectdir'][0]).to.equal(projectDir, 'Wrong arg');
            expect(args['format']).to.equal('html', 'Wrong arg');

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
                invokeTestedMethod();
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
                const args: Inputs = invokeTestedMethod();

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args['rule-disable-warning-violation']).to.equal(true, 'Wrong arg');
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
                const args: Inputs = invokeTestedMethod();

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args['rule-thread-timeout']).to.equal(`${timeout}`, 'Wrong arg');
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
                const args: Inputs = invokeTestedMethod();

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args['pathexplimit']).to.equal(`${limit}`, 'Wrong arg');
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
                const args: Inputs = invokeTestedMethod();

                // ===== ASSERTIONS =====
                // Verify that the right arguments were created.
                expect(args['sfgejvmargs']).to.equal(jvmArgs, 'Wrong arg');
            });
        });
    });
});
