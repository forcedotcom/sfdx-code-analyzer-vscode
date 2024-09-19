/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as path from 'path';
import Mocha = require('mocha');
import NYC = require('nyc');
import * as glob from 'glob';

// Simulates the recommended config option for NYC,
// `extends: "@istanbuljs/nyc-config-typescript"`.
import * as baseConfig from "@istanbuljs/nyc-config-typescript";

// Recommended modules; loading them here speeds up NYC init
// and minimizes risk of race conditions.
import "ts-node/register";
import "source-map-support/register";

// Linux: Preventing a weird NPE when Mocah on Linux requires the Window Size
// from the TTY. Since we're not running in a TTY environment, just statically
// implement the method.
import tty = require('tty');
if (!('getWindowSize' in tty)) {
	tty['getWindowSize'] = (): number[] => {
		return [80, 75];
	}
}

export async function run(): Promise<void> {

	// Set up coverage pre-test, including post-test hook to report.
	const nyc = new NYC({
		...baseConfig,
		cwd: path.join(__dirname, '..', '..', '..'),
		reporter: ['text-summary', 'html'],
		all: true,
		silent: false,
		instrument: true,
		hookRequire: true,
		hookRunInContext: true,
		hookRunInThisContext: true,
		include: ['out/**/*.js'],
		'check-coverage': true,
		exclude: ['out/test/**']
	});
	await nyc.reset();
	await nyc.wrap();

	// For any module that should be instrumented but is already loaded, print a warning,
	// then delete its cache entry and re-require it.
	// NOTE: This is bad practice for production code (could potentially cause memory leaks),
	// but for test-only code, it's acceptable.
	Object.keys(require.cache).filter(f => nyc.exclude.shouldInstrument(f)).forEach(m => {
		console.warn('Module loaded before NYC, invalidating: ', m);
		delete require.cache[m];
		require(m);
	});


	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true
	});

	const testsRoot = path.resolve(__dirname, '..');

	// Add all files to the test suite.
	const files = glob.sync('**/*.test.js', {cwd: testsRoot});
	files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

	// Run the Mocha tests.
	const failures: number = await new Promise(resolve => mocha.run(resolve));
	// Manually set the exit code to 0, then generate and check coverage.
	process.exitCode = 0;
	await nyc.writeCoverageFile();
	// If coverage requirements aren't met, `process.exitCode` is set to a non-zero value.
	// This is why we manually set it to 0 earlier.
	// TODO: Add branches check back once Apex Guru Integration and Delta runs implementation are complete.
	await nyc.checkCoverage({
		// branches: 70,
		lines: 40,
		functions: 40,
		statements: 40
	});

	// Echo the logs.
	console.log(await captureStdout(nyc.report.bind(nyc)));
	// If any tests failed, throw an error and use an exit code equal to the number of failures.
	// (Also, if code coverage requirements were unmet, indicate this too.)
	if (failures > 0) {
		process.exitCode = failures;
		throw new Error(`${failures} tests failed.${process.exitCode !== 0 ? ' Additionally, code coverage requirements not met.' : ''}`);
	} else if (process.exitCode !== 0) {
		// If tests all passed, but code coverage wasn't met, still exit with an error.
		throw new Error('All tests passed, but code coverage requirements not met.');
	}
}

async function captureStdout(fn) {
	let w = process.stdout.write, buffer = '';
	process.stdout.write = (s) => {buffer = buffer + s; return true;}
	await fn();
	process.stdout.write = w;
	return buffer;

}
