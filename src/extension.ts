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
import {SettingsManager} from './lib/settings';
import {SfCli} from './lib/sf-cli';

import {RuleResult} from './types';
import {DiagnosticManager} from './lib/diagnostics';
import {messages} from './lib/messages';
import {Fixer} from './lib/fixer';
import { CoreExtensionService, TelemetryService } from './lib/core-extension-service';
import * as Constants from './lib/constants';
import * as path from 'path';
import { SIGKILL } from 'constants';

type RunInfo = {
	diagnosticCollection?: vscode.DiagnosticCollection;
	outputChannel: vscode.LogOutputChannel;
	commandName: string;
}

/**
 * Declare a {@link vscode.DiagnosticCollection} at the global scope, to make it accessible
 * throughout the file.
 */
let diagnosticCollection: vscode.DiagnosticCollection = null;

/**
 * This method is invoked when the extension is first activated (this is currently configured to be when a sfdx project is loaded).
 * The activation trigger can be changed by changing activationEvents in package.json
 * Registers the necessary diagnostic collections and commands.
 */
export async function activate(context: vscode.ExtensionContext): Promise<vscode.ExtensionContext> {
	const extensionHrStart = process.hrtime();

	// We need to do this first in case any other services need access to those provided by the core extension.
	await CoreExtensionService.loadDependencies(context);

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

	// Declare our commands.
	const runOnActiveFile = vscode.commands.registerCommand(Constants.COMMAND_RUN_ON_ACTIVE_FILE, async () => {
		return _runAndDisplayPathless([], {
			commandName: Constants.COMMAND_RUN_ON_ACTIVE_FILE,
			diagnosticCollection,
			outputChannel
		});
	});
	const runOnSelected = vscode.commands.registerCommand(Constants.COMMAND_RUN_ON_SELECTED, async (selection: vscode.Uri, multiSelect?: vscode.Uri[]) => {
		return _runAndDisplayPathless(multiSelect && multiSelect.length > 0 ? multiSelect : [selection], {
			commandName: Constants.COMMAND_RUN_ON_SELECTED,
			diagnosticCollection,
			outputChannel
		});
	});
	const stopDfa = vscode.commands.registerCommand(Constants.COMMAND_STOP_DFA, () => {
		return _stopExistingDfaRun(context, outputChannel, true);
	});
	outputChannel.appendLine(`Registered command as part of sfdx-code-analyzer-vscode activation.`);
	registerScanOnSave(outputChannel);
	registerScanOnOpen(outputChannel);
	await _stopExistingDfaRun(context, outputChannel, false);
	outputChannel.appendLine('Registered scanOnSave as part of sfdx-code-analyzer-vscode activation.');

	const runDfaOnSelectedMethod = vscode.commands.registerCommand(Constants.COMMAND_RUN_DFA_ON_SELECTED_METHOD, async () => {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			title: messages.graphEngine.spinnerText,
			cancellable: true
		}, (progress, token) => {
			token.onCancellationRequested(async () => {
				await _stopExistingDfaRun(context, outputChannel, true);
			});
			return _runAndDisplayDfa(context, {
				commandName: Constants.COMMAND_RUN_DFA_ON_SELECTED_METHOD,
				outputChannel
			});
		});
	});
	context.subscriptions.push(runOnActiveFile, runOnSelected, runDfaOnSelectedMethod, stopDfa);
	TelemetryService.sendExtensionActivationEvent(extensionHrStart);
	outputChannel.appendLine(`Extension sfdx-code-analyzer-vscode activated.`);
	return Promise.resolve(context);
}

export async function _stopExistingDfaRun(context: vscode.ExtensionContext, outputChannel: vscode.LogOutputChannel, verbose: boolean) {
	const pid = context.globalState.get(Constants.GLOBAL_DFA_PROCESS);
	if (pid) {
		try {
			process.kill(pid as number, SIGKILL);
			await vscode.window.showInformationMessage(messages.graphEngine.dfaRunStopped);
		} catch (e) {
			const errMsg = e instanceof Error ? e.message : e as string;
			outputChannel.appendLine('Failed killing DFA process.');
			outputChannel.appendLine(errMsg);
		}
	} else if (verbose) {
		await vscode.window.showInformationMessage(messages.graphEngine.noDfaRun);	
	}
	void context.globalState.update(Constants.GLOBAL_DFA_PROCESS, undefined);
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

export function registerScanOnSave(outputChannel: vscode.LogOutputChannel) {
	vscode.workspace.onDidSaveTextDocument(
		async (textDocument: vscode.TextDocument) => {
			const documentUri = textDocument.uri;
			if (
				SettingsManager.getAnalyzeOnSave()
			) {
				await _runAndDisplayPathless([documentUri], {
					commandName: Constants.COMMAND_RUN_ON_ACTIVE_FILE,
					diagnosticCollection,
					outputChannel
				});
			}
		}
	);
}

export function registerScanOnOpen(outputChannel: vscode.LogOutputChannel) {
	vscode.workspace.onDidOpenTextDocument(
		async (textDocument: vscode.TextDocument) => {
			const documentUri = textDocument.uri;
			if (
				SettingsManager.getAnalyzeOnOpen()
			) {
				if (_isValidFileForAnalysis(documentUri)) {
					await _runAndDisplayPathless([documentUri], {
						commandName: Constants.COMMAND_RUN_ON_ACTIVE_FILE,
						diagnosticCollection,
						outputChannel
					});
				}
			}
		}
	);
}

/**
 * Runs non-Path-based rules against the selected files/directories, or the active file if nothing was selected.
 * @param selections The files/directories manually selected by the user.
 * @param runInfo A collection of services and information used to properly run the command.
 * @param runInfo.diagnosticCollection The collection to which diagnostics representing violations should be added.
 * @param runInfo.outputChannel The output channel where information should be logged as needed.
 * @param runinfo.commandName The specific command being executed
 * @returns
 */
export async function _runAndDisplayPathless(selections: vscode.Uri[], runInfo: RunInfo): Promise<void> {
	const {
		diagnosticCollection,
		outputChannel,
		commandName
	} = runInfo;
	const startTime = Date.now();
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
			TelemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_STATIC_ANALYSIS, {
				executedCommand: commandName,
				duration: (Date.now() - startTime).toString()
			});
			// This has to be a floating promise or else the progress bar won't disappear.
			// eslint-disable-next-line @typescript-eslint/no-floating-promises
			summarizeResultsAsToast(targets, results);
		});
	} catch (e) {
		const errMsg = e instanceof Error ? e.message : e as string;
		console.log(errMsg);
		TelemetryService.sendException(Constants.TELEM_FAILED_STATIC_ANALYSIS, errMsg, {
			executedCommand: commandName,
			duration: (Date.now() - startTime).toString()
		});
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
 * @param runInfo A collection of services and information used to properly run the command
 * @param runInfo.outputChannel The output channel where information should be logged as needed
 * @param runInfo.commandName The specific command being run
 */
export async function _runAndDisplayDfa(context:vscode.ExtensionContext ,runInfo: RunInfo): Promise<void> {
	const {
		outputChannel,
		commandName
	} = runInfo;
	const startTime = Date.now();
	try {
		await verifyPluginInstallation();
		if (await _shouldProceedWithDfaRun(context, outputChannel)) {
			// Set the Status Bar Item's text and un-hide it.
			// Get the targeted method.
			const methodLevelTarget: string = await targeting.getSelectedMethod();
			// Pull out the file from the target and use it to identify the project directory.
			const currentFile: string = methodLevelTarget.substring(0, methodLevelTarget.lastIndexOf('#'));
			const projectDir: string = targeting.getProjectDir(currentFile);
			const results: string = await new ScanRunner().runDfa([methodLevelTarget], projectDir, context);
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
			TelemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_DFA_ANALYSIS, {
				executedCommand: commandName,
				duration: (Date.now() - startTime).toString()
			})
		}
	} catch (e) {
		const errMsg = e instanceof Error ? e.message : e as string;
		console.log(errMsg);
		TelemetryService.sendException(Constants.TELEM_FAILED_DFA_ANALYSIS, errMsg, {
			executedCommand: commandName,
			duration: (Date.now() - startTime).toString()
		});
		// This has to be a floating promise, since the command won't complete until
		// the error is dismissed.
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		vscode.window.showErrorMessage(messages.error.analysisFailedGenerator(errMsg));
		outputChannel.error(errMsg)
		outputChannel.show();
	}
}

export async function _shouldProceedWithDfaRun(context: vscode.ExtensionContext, channel: vscode.LogOutputChannel): Promise<boolean> {
	if (context.globalState.get(Constants.GLOBAL_DFA_PROCESS)) {
		await vscode.window.showInformationMessage(messages.graphEngine.stopDfaRunConfirmationText, messages.graphEngine.stopDfaRunConfirmationYes, messages.graphEngine.stopDfaRunConfirmationNo)
			.then(async answer => {
				if (answer === messages.graphEngine.stopDfaRunConfirmationYes) {
					await _stopExistingDfaRun(context, channel, true);
					return true;
				}
			});
			return false;
	}
	return true;
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
	TelemetryService.dispose();
}

export function _isValidFileForAnalysis(documentUri: vscode.Uri) {
	const allowedFileTypes:string[] = ['.cls', '.js', '.apex', '.trigger', '.ts'];
	return allowedFileTypes.includes(path.extname(documentUri.path));
}

