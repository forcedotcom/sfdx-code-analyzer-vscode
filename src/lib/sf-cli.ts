/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
//import cspawn = require('cross-spawn');
import * as childProcess from 'node:child_process';

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
            const cp = childProcess.spawn('sf', ['-v']);

            cp.on('close', code => {
				console.log(`isSfCliInstalled got close event, code is ${code}`);
                // If the exit code is 0, then SF or SFDX is present.
                // Otherwise, it's not.
                res(code === 0);
            });

			cp.on('exit', code => {
				console.log(`isSfCliInstalled got exit event, code is ${code}`);
				res(code === 0);
			})
        });
    }

    /**
     *
     * @returns True if {@code @salesforce/sfdx-scanner} is installed.
     */
    public static async isCodeAnalyzerInstalled(): Promise<boolean> {
        return new Promise((res) => {
            const cp = childProcess.spawn('sf', ['plugins']);

            let stdout = '';

            cp.stdout.on('data', data => {
                stdout += data;
            });

            cp.on('close', code => {
                // If the code is non-zero, we can infer Code Analyzer's absence.
                res(code === 0 && stdout.includes('@salesforce/sfdx-scanner'));
            });
        });
    }
}
