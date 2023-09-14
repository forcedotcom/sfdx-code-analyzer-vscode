/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as targeting from './lib/targeting';
import {ScanRunner} from './lib/scanner';
import {SfCli} from './lib/sf-cli';

import {RuleResult} from './types';
import {DiagnosticManager} from './lib/diagnostics';
import {messages} from './lib/messages';
import {Fixer} from './lib/fixer';

/**
 * Declare a {@link vscode.DiagnosticCollection} at the global scope, to make it accessible
 * throughout the file.
 */
let diagnosticCollection: vscode.DiagnosticCollection = null;

/**
 * This method is invoked when the extension is first activated (i.e., the very first time the command is executed).
 * Registers the necessary diagnostic collections and commands.
 */
export function activate(context: vscode.ExtensionContext): Promise<vscode.ExtensionContext> {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log(`Extension sfdx-code-analyzer-vscode activated.`);

	// Define a diagnostic collection in the `activate()` scope so it can be used repeatedly.
	diagnosticCollection = vscode.languages.createDiagnosticCollection('sfca');
	context.subscriptions.push(diagnosticCollection);

	// Define a code action provider for quickfixes.
	const fixer = new Fixer();
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider({pattern: '**/**'}, fixer, {
			providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
		})
	);

	// Define a log output channel that we can use, and clear it so it's fresh.
	const outputChannel: vscode.LogOutputChannel = vscode.window.createOutputChannel('sfca', {log: true});
	outputChannel.clear();
	outputChannel.show();

	// Declare our commands. Their names must exactly match their declarations in `package.json`.
	const runOnActiveFile = vscode.commands.registerCommand('sfca.runOnActiveFile', async () => {
		return _runAndDisplayPathless([], diagnosticCollection, outputChannel);
	});
	const runOnSelected = vscode.commands.registerCommand('sfca.runOnSelected', async (selection: vscode.Uri, multiSelect?: vscode.Uri[]) => {
		return _runAndDisplayPathless(multiSelect && multiSelect.length > 0 ? multiSelect : [selection], diagnosticCollection, outputChannel);
	});
	const graphEngineStatus: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	graphEngineStatus.name = messages.graphEngine.statusBarName;
	context.subscriptions.push(graphEngineStatus);
	const runDfaOnSelectedMethod = vscode.commands.registerCommand('sfca.runDfaOnSelectedMethod', async () => {
		return _runAndDisplayDfa(graphEngineStatus, outputChannel);
	});
	context.subscriptions.push(runOnActiveFile, runOnSelected, runDfaOnSelectedMethod);
	return Promise.resolve(context);
}

/**
 * @throws If {@code sf}/{@code sfdx} or {@code @salesforce/sfdx-scanner} is not installed.
 */
async function verifyPluginInstallation(): Promise<void> {
	if (!await SfCli.isSfCliInstalled()) {
		throw new Error(messages.error.sfMissing);
	} else if (!await SfCli.isCodeAnalyzerInstalled()) {
		throw new Error(messages.error.sfdxScannerMissing);
	}
}

/**
 * Runs non-Path-based rules against the selected files/directories, or the active file if nothing was selected.
 * @param selections The files/directories manually selected by the user.
 * @param diagnosticCollection The collection to which diagnostics representing violations should be added.
 * @param outputChannel The output channel where information should be logged as needed.
 * @returns
 */
export async function _runAndDisplayPathless(selections: vscode.Uri[], diagnosticCollection: vscode.DiagnosticCollection, outputChannel: vscode.LogOutputChannel): Promise<void> {
	try {
		await verifyPluginInstallation();
		return await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification
		}, async (progress) => {
			// Get targets
			progress.report(messages.scanProgressReport.identifyingTargets);
			const targets: string[] = await targeting.getTargets(selections);

			// Run the scan.
			progress.report(messages.scanProgressReport.analyzingTargets);
			const results: RuleResult[] = await new ScanRunner().run(targets);

			progress.report(messages.scanProgressReport.processingResults);
			new DiagnosticManager().displayDiagnostics(targets, results, diagnosticCollection);
			// This has to be a floating promise or else the progress bar won't disappear.
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			summarizeResultsAsToast(targets, results);
		});
	} catch (e) {
		const errMsg = e instanceof Error ? e.message : e as string;
		console.log(errMsg);
		// This has to be a floating promise, since the command won't complete until
		// the error is dismissed.
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		vscode.window.showErrorMessage(messages.error.analysisFailedGenerator(errMsg));
		outputChannel.error(errMsg);
		outputChannel.show();
	}
}

// TODO: Consider refactoring this into separate methods for running and displaying, to improve readability and testability.
/**
 * Run Path-based rules against the method the user has clicked on.
 * @param statusBarItem The item to use in the status bar for displaying progress
 * @param outputChannel The output channel where information should be logged as needed
 */
export async function _runAndDisplayDfa(statusBarItem: vscode.StatusBarItem, outputChannel: vscode.LogOutputChannel): Promise<void> {
	try {
		await verifyPluginInstallation();
		// Set the Status Bar Item's text and un-hide it.
		statusBarItem.text = messages.graphEngine.spinnerText;
		statusBarItem.show();
		// Get the targeted method.
		const methodLevelTarget: string = await targeting.getSelectedMethod();
		// Pull out the file from the target and use it to identify the project directory.
		const currentFile: string = methodLevelTarget.substring(0, methodLevelTarget.lastIndexOf('#'));
		const projectDir: string = targeting.getProjectDir(currentFile);
		const results: string = await new ScanRunner().runDfa([methodLevelTarget], projectDir);
		statusBarItem.hide();
		if (results.length > 0) {
			const panel = vscode.window.createWebviewPanel(
				'dfaResults',
				messages.graphEngine.resultsTab,
				vscode.ViewColumn.Two,
				{
					enableScripts: true
				}
			);
			panel.webview.html = results;
		} else {
			await vscode.window.showInformationMessage(messages.graphEngine.noViolationsFound);
		}
	} catch (e) {
		const errMsg = e instanceof Error ? e.message : e as string;
		console.log(errMsg);
		// This has to be a floating promise, since the command won't complete until
		// the error is dismissed.
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		vscode.window.showErrorMessage(messages.error.analysisFailedGenerator(errMsg));
		outputChannel.error(errMsg)
		outputChannel.show();
		statusBarItem.hide();
	}
}

/**
 * Convenience method for clearing diagnostics.
 */
export function _clearDiagnostics(): void {
	diagnosticCollection.clear();
}

/**
 * Display a Toast summarizing the results of a non-DFA scan, i.e. how many files were scanned, how many had violations, and how many violations were found.
 * @param targets The files that were scanned. This may be a superset of the files that actually had violations.
 * @param results The results of a scan.
 */
async function summarizeResultsAsToast(targets: string[], results: RuleResult[]): Promise<void> {
	const uniqueFiles: Set<string> = new Set();
	let violationCount = 0;
	for (const result of results) {
		uniqueFiles.add(result.fileName);
		violationCount += result.violations.length;
	}
	await vscode.window.showInformationMessage(messages.info.finishedScan(targets.length, uniqueFiles.size, violationCount));
}

// This method is called when your extension is deactivated
export function deactivate() {
	// Intentionally left empty (for now?)
}
