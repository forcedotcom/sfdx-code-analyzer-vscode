/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as path from 'path';
import * as cp from 'child_process';
import {
	downloadAndUnzipVSCode,
	resolveCliArgsFromVSCodeExecutablePath,
	runTests
} from '@vscode/test-electron';

import { EXTENSION_PACK_ID } from '../lib/constants';

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		const vscodeExecutablePath = await downloadAndUnzipVSCode('stable');
		console.log(`path: ${vscodeExecutablePath}`);
		const [cliPath, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

		// Install the Salesforce Core extension pack
		cp.spawnSync(
			cliPath,
			[...args, '--install-extension', EXTENSION_PACK_ID],
			{
				encoding: 'utf-8',
				stdio: 'inherit',
				shell: process.platform === 'win32'
			}
		);

		const extensionTestsEnv = {
			JAVA_HOME: process.env.JAVA_HOME
		}

		// Download VS Code, unzip it and run the integration test
		await runTests({ vscodeExecutablePath, extensionDevelopmentPath, extensionTestsPath, extensionTestsEnv });
	} catch (_err) {
		console.error('Failed to run tests');
		process.exit(1);
	}
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
