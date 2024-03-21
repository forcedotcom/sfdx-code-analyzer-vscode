/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {SettingsManager} from './settings';
import {ExecutionResult, RuleResult} from '../types';
import cspawn = require('cross-spawn');
import {RunAction} from '@salesforce/sfdx-scanner/lib/lib/actions/RunAction';
import {InputProcessor, InputProcessorImpl} from '@salesforce/sfdx-scanner/lib/lib/InputProcessor';
import { Display } from '@salesforce/sfdx-scanner/lib/lib/Display';
import { VSCodeDisplay } from './display';
import { RuleFilterFactory, RuleFilterFactoryImpl } from '@salesforce/sfdx-scanner/lib/lib/RuleFilterFactory';
import { EngineOptionsFactory, RunEngineOptionsFactory } from '@salesforce/sfdx-scanner/lib/lib/EngineOptionsFactory';
import { ResultsProcessorFactory, ResultsProcessorFactoryImpl } from '@salesforce/sfdx-scanner/lib/lib/output/ResultsProcessorFactory';
import {Logger} from "@salesforce/core";
import { AnyJson } from "@salesforce/ts-types";
import { Inputs } from './types';


/**
 * Class for interacting with the {@code @salesforce/sfdx-scanner} plug-in.
 */
export class ScanRunner {
    /**
     * Run the non-DFA rules against the specified target files
     * @param targets A list of files to be targeted by the scan
     * @returns The results of the scan
     */
    public async run(targets: string[]): Promise<RuleResult[]> {
        // Create the arg array.
        const args: Inputs = this.createPathlessArgArray(targets);

        // Invoke the scanner.
        // const executionResult = await this.invokeAnalyzer(args);
        const executionResult: AnyJson = await this.invokeAnalyzerWithoutCli(args);

        // Process the results.
        // return this.processPathlessResults(executionResult); 
        return executionResult as RuleResult[];
    }

    /**
     * Run the DFA rules against the specified targets
     * @param targets The targets for the scan. At this time, these must be method-level targets
     * formatted as {@code path/to/file.cls#someMethod}.
     * @param projectDir The directory containing all files in the project to be scanned.
     * @returns The HTML-formatted scan results, or an empty string if no violations were found.
     */
    public async runDfa(targets: string[], projectDir: string): Promise<string> {
        // Create the arg array.
        const args: Inputs = this.createDfaArgArray(targets, projectDir);

        // Invoke the scanner.
        const executionResult: AnyJson = await this.invokeAnalyzerWithoutCli(args);

        // Process the results.
        return executionResult as string;
    }

    /**
     * Creates the arguments for an execution of {@code sf scanner run dfa}, for use in a child process.
     * @param targets The files/methods to be targeted.
     * @param projectDir The root of the project to be scanned.
     */
    private createDfaArgArray(targets: string[], projectDir: string): Inputs {
        // const args: Inputs = {
        //     'targets': `${targets.join(',')}`,
        //     'engine': 'pmd,retire-js',
        //     'format': 'json'
        // }
        // return args;


        const args: Inputs = {
            'targets': `${targets.join(',')}`,
            'projectdir': [projectDir],
            'format': `html`,
            'json': true,
        }
        // There are a number of custom settings that we need to check too.
        // First we should check whether warning violations are disabled.
        if (SettingsManager.getGraphEngineDisableWarningViolations()) {
            args['rule-disable-warning-violation'] = true;
        }
        // Then we should check whether a custom timeout was specified.
        const threadTimeout: number = SettingsManager.getGraphEngineThreadTimeout();
        if (threadTimeout != null) {
            args['rule-thread-timeout'] = `${threadTimeout}`;
        }
        // Then we should check whether a custom path expansion limit is set.
        const pathExpansionLimit: number = SettingsManager.getGraphEnginePathExpansionLimit();
        if (pathExpansionLimit != null) {
            args['pathexplimit'] = `${pathExpansionLimit}`;
        }
        // Then we should check whether custom JVM args were specified.
        const jvmArgs: string = SettingsManager.getGraphEngineJvmArgs();
        if (jvmArgs) {
            args['sfgejvmargs'] = jvmArgs;
        }
        // NOTE: We don't check custom threadcount because we can only run against one entrypoint.
        //       If we ever add multi-entrypoint scanning in VSCode, we'll also need a setting for
        //       threadcount.
        // TODO: Once RemoveUnusedMethod is made less noisy, add a setting for enabling Pilot rules.
        return args;
    }

    /**
     * Creates the arguments for an execution of {@code sf scanner run}.
     * @param targets The files to be scanned.
     */
    private createPathlessArgArray(targets: string[]): Inputs {
        const args: Inputs = {
            'targets': `${targets.join(',')}`,
            'engine': 'pmd,retire-js',
            'format': 'json'
        }
        return args;
    }

    /**
     * Uses the provided arguments to run a Salesforce Code Analyzer command.
     * @param args The arguments to be supplied
     */
    private async invokeAnalyzer(args: string[]): Promise<ExecutionResult> {
        return new Promise((res) => {
            const cp = cspawn.spawn('sf', args);

            let stdout = '';

            cp.stdout.on('data', data => {
                stdout += data;
            });

            cp.on('exit', () => {
                // No matter what, stdout will be an execution result.
                res(JSON.parse(stdout) as ExecutionResult);
            });
        });
    }

        /**
     * Uses the provided arguments to run a Salesforce Code Analyzer command.
     * @param args The arguments to be supplied
     */
    private async invokeAnalyzerWithoutCli(args: Inputs): Promise<AnyJson> {
        const sfVersion = '0.5';
        const logger: Logger = await Logger.child('vscode');
        const display:Display = new VSCodeDisplay();
        const inputProcessor: InputProcessor = new InputProcessorImpl(sfVersion, display);
        const ruleFilterFactory: RuleFilterFactory = new RuleFilterFactoryImpl();
        const engineOptionsFactory: EngineOptionsFactory = new RunEngineOptionsFactory(inputProcessor);
        const resultsProcessorFactory: ResultsProcessorFactory = new ResultsProcessorFactoryImpl();
        const runAction:RunAction = new RunAction(logger, display, inputProcessor, ruleFilterFactory, engineOptionsFactory,
            resultsProcessorFactory);
        return this.validateAndRun(runAction, args);
    }

    private async validateAndRun(runAction:RunAction, args: Inputs): Promise<AnyJson> {
        await runAction.validateInputs(args);
        return runAction.run(args);
    }

    /**
     *
     * @param executionResult The results from a scan
     * @returns The HTML-formatted scan results, or an empty string.
     * @throws If {@code executionResult.result} is not a string.
     * @throws If {@code executionResult.warnings} contains any warnings about methods not being found.
     * @throws if {@code executionResult.status} is non-zero.
     */
    private processDfaResults(executionResult: ExecutionResult): string {
        // 0 is the status code indicating a successful analysis.
        if (executionResult.status === 0) {
            // Since we're using HTML format, the results should always be a string.
            // Enforce this assumption.
            if (typeof executionResult.result !== 'string') {
                // Hardcoding this message should be fine, because it should only ever
                // appear in response to developer error, not user error.
                throw new Error('Output should always be a string.');
            }

            // Before we do anything else, check our warnings, since we're escalating
            // some of them to errors.
            // NOTE: This section should be considered tentative. In addition to being
            //       generally inelegant, it's not great practice to key off specific
            //       messages in this fashion.
            if (executionResult.warnings?.length > 0) {
                for (const warning of executionResult.warnings) {
                    // Since (for now) DFA only runs on a single method,
                    // if we couldn't find that method, then that's a critical
                    // error even though DFA itself just considered it a warning.
                    if (warning.toLowerCase().startsWith('no methods in file ')) {
                        throw new Error(warning);
                    }
                }
            }

            const result: string = executionResult.result;

            if (result.startsWith("<!DOCTYPE")) {
                // If the results are an HTML body, then violations were found. Return that.
                return result;
            } else {

                // Otherwise, violations weren't found. Return an empty string.
                return "";
            }
        } else {
            // Any other status code indicates an error of some kind.
            throw new Error(executionResult.message);
        }
    }

    /**
     *
     * @param executionResult The results from a scan.
     * @returns The Rule Results pulled out of the execution results, or an empty array.
     * @throws if {@coder executionResult.status} is non-zero
     */
    private processPathlessResults(executionResult: ExecutionResult): RuleResult[] {
        // 0 is the status code indicating a successful analysis.
        if (executionResult.status === 0) {
            // If the results were a string, that indicates that no results were found.
            // TODO: Maybe change the plugin to return an empty array instead?
            //       If that happens, this needs to change.
            if (typeof executionResult.result === 'string') {
                return [];
            } else {
                return executionResult.result;
            }
        } else {
            // Any other status code indicates an error of some kind.
            throw new Error(executionResult.message);
        }
    }
}
