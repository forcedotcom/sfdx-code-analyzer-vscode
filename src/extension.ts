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
import * as ApexGuruFunctions from './apexguru/apex-guru-service'

export type RunInfo = {
	diagnosticCollection?: vscode.DiagnosticCollection;
	commandName: string;
	outputChannel?: vscode.LogOutputChannel;
}

/**
 * Declare a {@link vscode.DiagnosticCollection} at the global scope, to make it accessible
 * throughout the file.
 */
let diagnosticCollection: vscode.DiagnosticCollection = null;

let customCancellationToken: vscode.CancellationTokenSource | null = null;

let outputChannel: vscode.LogOutputChannel;

/**
 * This method is invoked when the extension is first activated (this is currently configured to be when a sfdx project is loaded).
 * The activation trigger can be changed by changing activationEvents in package.json
 * Registers the necessary diagnostic collections and commands.
 */
export async function activate(context: vscode.ExtensionContext): Promise<vscode.ExtensionContext> {
	const extensionHrStart = process.hrtime();

	// Define a log output channel that we can use, and clear it so it's fresh.
	outputChannel = vscode.window.createOutputChannel('Salesforce Code Analyzer', {log: true});
	outputChannel.clear();
	outputChannel.show();	

	// We need to do this first in case any other services need access to those provided by the core extension.
	await CoreExtensionService.loadDependencies(context, outputChannel);

	const apexGuruEnabled = Constants.APEX_GURU_FEATURE_FLAG_ENABLED && await ApexGuruFunctions.isApexGuruEnabledInOrg(outputChannel);
	// Set the necessary flags to control showing the command
	await vscode.commands.executeCommand('setContext', 'sfca.apexGuruEnabled', apexGuruEnabled);

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

	// Declare our commands.
	const runOnActiveFile = vscode.commands.registerCommand(Constants.COMMAND_RUN_ON_ACTIVE_FILE, async () => {
		return _runAndDisplayPathless([], {
			commandName: Constants.COMMAND_RUN_ON_ACTIVE_FILE,
			diagnosticCollection
		});
	});
	const runOnSelected = vscode.commands.registerCommand(Constants.COMMAND_RUN_ON_SELECTED, async (selection: vscode.Uri, multiSelect?: vscode.Uri[]) => {
		return _runAndDisplayPathless(multiSelect && multiSelect.length > 0 ? multiSelect : [selection], {
			commandName: Constants.COMMAND_RUN_ON_SELECTED,
			diagnosticCollection
		});
	});
	const removeDiagnosticsOnActiveFile = vscode.commands.registerCommand(Constants.COMMAND_REMOVE_DIAGNOSTICS_ON_ACTIVE_FILE, async () => {
		return _clearDiagnosticsForSelectedFiles([], {
			commandName: Constants.COMMAND_REMOVE_DIAGNOSTICS_ON_ACTIVE_FILE,
			diagnosticCollection
		});
	});
	const removeDiagnosticsOnSelectedFile = vscode.commands.registerCommand(Constants.COMMAND_REMOVE_DIAGNOSTICS_ON_SELECTED_FILE, async (selection: vscode.Uri, multiSelect?: vscode.Uri[]) => {
		return _clearDiagnosticsForSelectedFiles(multiSelect && multiSelect.length > 0 ? multiSelect : [selection], {
			commandName: Constants.COMMAND_REMOVE_DIAGNOSTICS_ON_SELECTED_FILE,
			diagnosticCollection
		});
	});
	const removeDiagnosticsInRange = vscode.commands.registerCommand(Constants.COMMAND_DIAGNOSTICS_IN_RANGE, (uri: vscode.Uri, range: vscode.Range) => {
		_removeDiagnosticsInRange(uri, range, diagnosticCollection);
	});
	outputChannel.appendLine(`Registered command as part of sfdx-code-analyzer-vscode activation.`);
	registerScanOnSave();
	registerScanOnOpen();
	outputChannel.appendLine('Registered scanOnSave as part of sfdx-code-analyzer-vscode activation.');

	// It is possible that the cache was not cleared when VS Code exited the last time. Just to be on the safe side, we clear the DFA process cache at activation.
	void context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);

	const runDfaOnSelectedMethodCmd = vscode.commands.registerCommand(Constants.COMMAND_RUN_DFA_ON_SELECTED_METHOD, async () => {
		if (await _shouldProceedWithDfaRun(context)) {
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Window,
				title: messages.graphEngine.spinnerText,
				cancellable: true
			}, async (progress, token) => {
				token.onCancellationRequested(async () => {
					await _stopExistingDfaRun(context);
				});
				customCancellationToken = new vscode.CancellationTokenSource();
				customCancellationToken.token.onCancellationRequested(async () => {
					customCancellationToken?.dispose();
					customCancellationToken = null;
					await vscode.window.showInformationMessage(messages.graphEngine.noViolationsFound);
					return;
				});
				const methodLevelTarget: string = await targeting.getSelectedMethod();
				// Pull out the file from the target and use it to identify the project directory.
				const currentFile: string = methodLevelTarget.substring(0, methodLevelTarget.lastIndexOf('#'));
				const projectDir: string = targeting.getProjectDir(currentFile);

				return _runAndDisplayDfa(context, {
					commandName: Constants.COMMAND_RUN_DFA_ON_SELECTED_METHOD
				}, customCancellationToken, methodLevelTarget, projectDir);
			});
		}
	});

	const runDfaOnWorkspaceCmd = vscode.commands.registerCommand(Constants.COMMAND_RUN_DFA, async () => {
		await _runDfa(context);
	});
	context.subscriptions.push(runOnActiveFile, runOnSelected, runDfaOnSelectedMethodCmd, runDfaOnWorkspaceCmd, removeDiagnosticsOnActiveFile, removeDiagnosticsOnSelectedFile, removeDiagnosticsInRange);
	
	if (apexGuruEnabled) {
		const runApexGuruOnSelectedFile = vscode.commands.registerCommand(Constants.COMMAND_RUN_APEX_GURU_ON_FILE, async (selection: vscode.Uri, multiSelect?: vscode.Uri[]) => {
			return await ApexGuruFunctions.runApexGuruOnFile(multiSelect && multiSelect.length > 0 ? multiSelect[0] : selection, 
				{
					commandName: Constants.COMMAND_RUN_APEX_GURU_ON_FILE,
					diagnosticCollection,
					outputChannel: outputChannel
				});
		});

		context.subscriptions.push(runApexGuruOnSelectedFile);
	}
	
	TelemetryService.sendExtensionActivationEvent(extensionHrStart);
	outputChannel.appendLine(`Extension sfdx-code-analyzer-vscode activated.`);
	return Promise.resolve(context);
}

async function _runDfa(context: vscode.ExtensionContext) {
	if (violationsCacheExists()) {
		const choice = await vscode.window.showQuickPick(
			['***Yes***', '***No***'],
			{
				placeHolder: '***We identified a previous Salesforce Graph Engine run. Do you want to only run the previously failed violations from that run?***',
				canPickMany: false,
				ignoreFocusOut: true
			}
		);

		// Default to "Yes" if no choice is made
		const rerunFailedOnly = choice == '***Yes***';
		if (rerunFailedOnly) {
			// Do nothing for now. This will be implemented as part of W-15639759
			return;
		} else {
			void vscode.window.showWarningMessage('***A full run of the graph engine will happen in the background. You can cancel this by clicking on the status progress.***');
			await runDfaOnWorkspace(context);
		}
	} else {
		await runDfaOnWorkspace(context);
	}
}

async function runDfaOnWorkspace(context: vscode.ExtensionContext) {
	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Window,
		title: messages.graphEngine.spinnerText,
		cancellable: true
	}, async (progress, token) => {
		token.onCancellationRequested(async () => {
			await _stopExistingDfaRun(context);
		});
		customCancellationToken = new vscode.CancellationTokenSource();
		customCancellationToken.token.onCancellationRequested(async () => {
			customCancellationToken?.dispose();
			customCancellationToken = null;
			await vscode.window.showInformationMessage(messages.graphEngine.noViolationsFound);
			return;
		});

		// We only have one project loaded on VSCode at once. So, projectDir should have only one entry and we use
		// the root directory of that project as the projectDir argument to run DFA.
		return _runAndDisplayDfa(context, {
			commandName: Constants.COMMAND_RUN_DFA_ON_SELECTED_METHOD
		}, customCancellationToken, null, targeting.getProjectDir());
	});
}

function violationsCacheExists() {
	// Returns true for now. Actual cache check will be performed as part of W-15639759.
	return true;
}

export function _removeDiagnosticsInRange(uri: vscode.Uri, range: vscode.Range, diagnosticCollection: vscode.DiagnosticCollection) {
	const currentDiagnostics = diagnosticCollection.get(uri) || [];
	const updatedDiagnostics = filterOutDiagnosticsInRange(currentDiagnostics, range);
	diagnosticCollection.set(uri, updatedDiagnostics);
}

function filterOutDiagnosticsInRange(currentDiagnostics: readonly vscode.Diagnostic[], range: vscode.Range) {
	return currentDiagnostics.filter(diagnostic => (diagnostic.range.start.line != range.start.line && diagnostic.range.end.line != range.end.line));
}

export async function _stopExistingDfaRun(context: vscode.ExtensionContext): Promise<void> {
	const pid = context.workspaceState.get(Constants.WORKSPACE_DFA_PROCESS);
	if (pid) {
		try {
			process.kill(pid as number, SIGKILL);
			void context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);
			await vscode.window.showInformationMessage(messages.graphEngine.dfaRunStopped);
		} catch (e) {
			// Exception is thrown by process.kill if between the time the pid exists and kill is executed, the process
			// ends by itself. Ideally it should clear the cache, but doing this as an abundant of caution.
			void context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);
			const errMsg = e instanceof Error ? e.message : e as string;
			outputChannel.appendLine('Failed killing DFA process.');
			outputChannel.appendLine(errMsg);
		}
	} else {
		await vscode.window.showInformationMessage(messages.graphEngine.noDfaRun);	
	}
}

/**
 * @throws If {@code sf}/{@code sfdx} or {@code @salesforce/sfdx-scanner} is not installed.
 */
export async function verifyPluginInstallation(): Promise<void> {
	if (!await SfCli.isSfCliInstalled()) {
		throw new Error(messages.error.sfMissing);
	} else if (!await SfCli.isCodeAnalyzerInstalled()) {
		throw new Error(messages.error.sfdxScannerMissing);
	}
}

export function registerScanOnSave() {
	vscode.workspace.onDidSaveTextDocument(
		async (textDocument: vscode.TextDocument) => {
			const documentUri = textDocument.uri;
			if (
				SettingsManager.getAnalyzeOnSave()
			) {
				await _runAndDisplayPathless([documentUri], {
					commandName: Constants.COMMAND_RUN_ON_ACTIVE_FILE,
					diagnosticCollection
				});
			}
		}
	);
}

export function registerScanOnOpen() {
	vscode.workspace.onDidOpenTextDocument(
		async (textDocument: vscode.TextDocument) => {
			const documentUri = textDocument.uri;
			if (
				SettingsManager.getAnalyzeOnOpen()
			) {
				if (_isValidFileForAnalysis(documentUri)) {
					await _runAndDisplayPathless([documentUri], {
						commandName: Constants.COMMAND_RUN_ON_ACTIVE_FILE,
						diagnosticCollection
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
 * @param runinfo.commandName The specific command being executed
 * @returns
 */
export async function _runAndDisplayPathless(selections: vscode.Uri[], runInfo: RunInfo): Promise<void> {
	const {
		diagnosticCollection,
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
 * @param runInfo.commandName The specific command being run
 */
export async function _runAndDisplayDfa(context:vscode.ExtensionContext ,runInfo: RunInfo, cancelToken: vscode.CancellationTokenSource, methodLevelTarget: string, projectDir: string): Promise<void> {
	const {
		commandName
	} = runInfo;
	const startTime = Date.now();
	try {
		await verifyPluginInstallation();
		const results = await new ScanRunner().runDfa([methodLevelTarget], projectDir, context);
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
			cancelToken.cancel();
		}
		TelemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_DFA_ANALYSIS, {
			executedCommand: commandName,
			duration: (Date.now() - startTime).toString()
		})
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

export async function _shouldProceedWithDfaRun(context: vscode.ExtensionContext): Promise<boolean> {
	if (context.workspaceState.get(Constants.WORKSPACE_DFA_PROCESS)) {
		await vscode.window.showInformationMessage(messages.graphEngine.existingDfaRunText);
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
 * Clear diagnostics for a specific files
 * @param selections selected files
 * @param runInfo command and diagnostic collection object
 */
export async function _clearDiagnosticsForSelectedFiles(selections: vscode.Uri[], runInfo: RunInfo): Promise<void> {
	const {
		diagnosticCollection,
		commandName
	} = runInfo;
	const startTime = Date.now();

	try {
		const targets: string[] = await targeting.getTargets(selections);

		for (const target of targets) {
			diagnosticCollection.delete(vscode.Uri.file(target));
		}
		
		TelemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_STATIC_ANALYSIS, {
			executedCommand: commandName,
			duration: (Date.now() - startTime).toString()
		});
	} catch (e) {
        const errMsg = e instanceof Error ? e.message : e as string;
        console.log(errMsg);
        TelemetryService.sendException(Constants.TELEM_FAILED_STATIC_ANALYSIS, errMsg, {
            executedCommand: commandName,
            duration: (Date.now() - startTime).toString()
        });
        outputChannel.error(errMsg);
        outputChannel.show();
    }
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

