/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';
import {SettingsManager, SettingsManagerImpl} from './settings';
import {V4ExecutionResult} from './scanner-strategies/v4-scanner';
import * as Constants from './constants';
import * as cspawn from 'cross-spawn';

/**
 * Class for interacting with the {@code @salesforce/sfdx-scanner} plug-in.
 */
export class ScanRunner {
    private readonly settingsManager: SettingsManager;

    public constructor(settingsManager?: SettingsManager) {
        this.settingsManager = settingsManager ?? new SettingsManagerImpl();
    }

    /**
     * Run the DFA rules against the specified targets
     * @param targets The targets for the scan. At this time, these must be method-level targets
     * formatted as {@code path/to/file.cls#someMethod}.
     * @param projectDir The directory containing all files in the project to be scanned.
     * @returns The HTML-formatted scan results, or an empty string if no violations were found.
     */
    public async runDfa(targets: string[], projectDir: string, context: vscode.ExtensionContext, cacheFilePath?: string): Promise<string> {
        // Create the arg array.
        const args: string[] = this.createDfaArgArray(targets, projectDir, cacheFilePath);

        // Invoke the scanner.
        const executionResult: V4ExecutionResult = await this.invokeDfaAnalyzer(args, context);

        // Process the results.
        return this.processDfaResults(executionResult);
    }

    /**
     * Creates the arguments for an execution of {@code sf scanner run dfa}, for use in a child process.
     * @param targets The files/methods to be targeted.
     * @param projectDir The root of the project to be scanned.
     */
    private createDfaArgArray(targets: string[], projectDir: string, cacheFilePath?: string): string[] {
        const args: string[] = [
            'scanner', 'run', 'dfa',
            `--projectdir`, projectDir,
            // NOTE: For now, we're using HTML output since it's the easiest to display to the user.
            //       This is exceedingly likely to change as we refine and polish the extension.
            `--format`, `html`,
            // NOTE: Using `--json` gives us easily-processed results, but denies us access to some
            //       elements of logging, most notably the informative progress reporting provided
            //       by the engine's spinner. This was deemed an acceptable trade-off during initial
            //       implementation, but we may wish to rethink this in the future as we polish things.
            `--json`
        ];

        if (targets && targets.filter(target => target != null).length > 0) {
            args.push('--target', `${targets.join(',')}`);
        }

        if (cacheFilePath) {
            args.push('--cachepath', cacheFilePath);
            args.push('--enablecaching');
        }

        // There are a number of custom settings that we need to check too.
        // First we should check whether warning violations are disabled.
        if (this.settingsManager.getGraphEngineDisableWarningViolations()) {
            args.push('--rule-disable-warning-violation');
        }
        // Then we should check whether a custom timeout was specified.
        const threadTimeout: number = this.settingsManager.getGraphEngineThreadTimeout();
        if (threadTimeout != null) {
            args.push('--rule-thread-timeout', `${threadTimeout}`);
        }
        // Then we should check whether a custom path expansion limit is set.
        const pathExpansionLimit: number = this.settingsManager.getGraphEnginePathExpansionLimit();
        if (pathExpansionLimit != null) {
            args.push('--pathexplimit', `${pathExpansionLimit}`);
        }
        // Then we should check whether custom JVM args were specified.
        const jvmArgs: string = this.settingsManager.getGraphEngineJvmArgs();
        if (jvmArgs) {
            args.push('--sfgejvmargs', jvmArgs);
        }
        // NOTE: We don't check custom threadcount because we can only run against one entrypoint.
        //       If we ever add multi-entrypoint scanning in VSCode, we'll also need a setting for
        //       threadcount.
        // TODO: Once RemoveUnusedMethod is made less noisy, add a setting for enabling Pilot rules.
        return args;
    }

    /**
     * Uses the provided arguments to run a Salesforce Code Analyzer command.
     * @param args The arguments to be supplied
     */
    private async invokeDfaAnalyzer(args: string[], context: vscode.ExtensionContext): Promise<V4ExecutionResult> {
        return new Promise((res) => {
            const cp = cspawn.spawn('sf', args);
            void context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, cp.pid);

            let stdout = '';

            cp.stdout.on('data', data => {
                stdout += data;
            });

            cp.on('exit', () => {
                // No matter what, stdout will be an execution result.
                res(JSON.parse(stdout) as V4ExecutionResult);
                void context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);
            });

        });
    }

    /**
     *
     * @param executionResult The results from a scan
     * @returns The HTML-formatted scan results, or an empty string.
     * @throws If {@code executionResult.result} is not a string.
     * @throws If {@code executionResult.warnings} contains any warnings about methods not being found.
     * @throws if {@code executionResult.status} is non-zero.
     */
    private processDfaResults(executionResult: V4ExecutionResult): string {
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
}
