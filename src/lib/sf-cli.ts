/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import cspawn = require('cross-spawn');

/**
 * Class for interacting with {@code sf}/{@code sfdx} via the CLI.
 */
export class SfCli {

    /**
     *
     * @returns True if {@code sf} or {@code sfdx} is installed.
     */
    public static async isSfCliInstalled(): Promise<boolean> {
        return new Promise((res) => {
            const cp = cspawn.spawn('sf', ['-v']);

            cp.on('exit', code => {
                // If the exit code is 0, then SF or SFDX is present.
                // Otherwise, it's not.
                res(code === 0);
            });
        });
    }

    /**
     *
     * @returns True if {@code @salesforce/sfdx-scanner} is installed.
     */
    public static async isCodeAnalyzerInstalled(): Promise<boolean> {
        return new Promise((res) => {
            const cp = cspawn.spawn('sf', ['plugins']);

            let stdout = '';

            cp.stdout.on('data', data => {
                stdout += data;
            });

            cp.on('exit', code => {
                // If the code is non-zero, we can infer Code Analyzer's absence.
                res(code === 0 && stdout.includes('@salesforce/sfdx-scanner'));
            });
        });
    }
}
