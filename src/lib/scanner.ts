/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {SettingsManager} from './settings';
import {RuleResult} from '../types';
import {exists} from './file';
import {messages} from './messages';
import {RunAction} from '@salesforce/sfdx-scanner/lib/lib/actions/RunAction';
import {RunDfaAction} from '@salesforce/sfdx-scanner/lib/lib/actions/RunDfaAction';
import {InputProcessor, InputProcessorImpl} from '@salesforce/sfdx-scanner/lib/lib/InputProcessor';
import { Display } from '@salesforce/sfdx-scanner/lib/lib/Display';
import { NoOpDisplay } from './display';
import { RuleFilterFactory, RuleFilterFactoryImpl } from '@salesforce/sfdx-scanner/lib/lib/RuleFilterFactory';
import { EngineOptionsFactory, RunEngineOptionsFactory, RunDfaEngineOptionsFactory } from '@salesforce/sfdx-scanner/lib/lib/EngineOptionsFactory';
import { ResultsProcessorFactory, ResultsProcessorFactoryImpl } from '@salesforce/sfdx-scanner/lib/lib/output/ResultsProcessorFactory';
import {Logger} from "@salesforce/core";
import { AnyJson } from "@salesforce/ts-types";
import { Inputs } from '@salesforce/sfdx-scanner/lib/types';


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
        const args: Inputs = await this.createPathlessArgArray(targets);

        // Invoke the scanner.
        const executionResult: AnyJson = await this.invokeAnalyzer(args, false);

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

        // Invoke the scanner. It is ok to cast anyjson as string since 
        // dfa output is in HTML format.
        const executionResult: string = await this.invokeAnalyzer(args, true) as string;

        // Process the results.
        return executionResult;
    }

    /**
     * Creates the arguments for an execution of {@code sf scanner run dfa}, for use in a child process.
     * @param targets The files/methods to be targeted.
     * @param projectDir The root of the project to be scanned.
     */
    private createDfaArgArray(targets: string[], projectDir: string): Inputs {
        const args: Inputs = {
            'target': targets,
            'projectdir': [projectDir],
            'format': `html`
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
    private async createPathlessArgArray(targets: string[]): Promise<Inputs> {
        const args: Inputs = {
            'target': targets,
            'engine': 'pmd,retire-js',
            'format': 'json'
        }
        const customPmdConfig: string = SettingsManager.getPmdCustomConfigFile();
        // If there's a non-null, non-empty PMD config file specified, use it.
        if (customPmdConfig && customPmdConfig.length > 0) {
            if (!(await exists(customPmdConfig))) {
                throw new Error(messages.error.pmdConfigNotFoundGenerator(customPmdConfig));
            }
            args['pmdconfig'] = customPmdConfig;
        }
        return args;
    }

    /**
     * Uses the provided arguments similar to running a Salesforce Code Analyzer command.
     * @param args The arguments to be supplied
     */
    private async invokeAnalyzer(args: Inputs, isDfa: boolean): Promise<AnyJson> {
        const sfVersion = '0.0.0';
        const logger: Logger = await Logger.child('vscode');
        const display:Display = new NoOpDisplay();
        const inputProcessor: InputProcessor = new InputProcessorImpl(sfVersion, display);
        const ruleFilterFactory: RuleFilterFactory = new RuleFilterFactoryImpl();
        const resultsProcessorFactory: ResultsProcessorFactory = new ResultsProcessorFactoryImpl();
        if (isDfa) {
            const engineOptionsFactory: EngineOptionsFactory = new RunDfaEngineOptionsFactory(inputProcessor);
            const runAction:RunDfaAction = new RunDfaAction(logger, display, inputProcessor, ruleFilterFactory, engineOptionsFactory,
                resultsProcessorFactory);
            await runAction.validateInputs(args);
            return runAction.run(args);
        } else {
            const engineOptionsFactory: EngineOptionsFactory = new RunEngineOptionsFactory(inputProcessor);
            const runAction:RunAction = new RunAction(logger, display, inputProcessor, ruleFilterFactory, engineOptionsFactory,
                resultsProcessorFactory);
            await runAction.validateInputs(args);
            return runAction.run(args);
        }
    }
}
