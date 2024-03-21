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
}
