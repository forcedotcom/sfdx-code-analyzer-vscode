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
import {SettingsManagerImpl, SettingsManager} from './lib/settings';
import {SfCli} from './lib/sf-cli';

import {Displayable, ProgressNotification, UxDisplay} from './lib/display';
import {DiagnosticManager, DiagnosticConvertible, DiagnosticManagerImpl} from './lib/diagnostics';
import {ScannerAction} from './lib/actions/scanner-action';
import { CliScannerV4Strategy } from './lib/scanner-strategies/v4-scanner';
import {messages} from './lib/messages';
import {Fixer} from './lib/fixer';
import { CoreExtensionService, TelemetryService, TelemetryServiceImpl } from './lib/core-extension-service';
import * as Constants from './lib/constants';
import * as path from 'path';
import { SIGKILL } from 'constants';
import * as ApexGuruFunctions from './apexguru/apex-guru-service';
import * as DeltaRunFunctions from './deltarun/delta-run-service';
import * as os from 'os';
import * as fs from 'fs';
import { VSCodeUnifiedDiff, DiffHunk } from 'einstein-shared';
import { ApexPmdViolationsFixer } from './modelBasedFixers/apex-pmd-violations-fixer'
import { NoOpScannerStrategy } from './lib/scanner-strategies/scanner-strategy';

export type RunInfo = {
	diagnosticCollection?: vscode.DiagnosticCollection;
	commandName: string;
	outputChannel?: vscode.LogOutputChannel;
}

export type ScannerDependencies = {
	diagnosticManager: DiagnosticManager;
	telemetryService: TelemetryService;
	settingsManager: SettingsManager;
};

/**
 * Declare a {@link vscode.DiagnosticCollection} at the global scope, to make it accessible
 * throughout the file.
 */
let diagnosticCollection: vscode.DiagnosticCollection = null;

let telemetryService: TelemetryServiceImpl = null;

let customCancellationToken: vscode.CancellationTokenSource | null = null;

let outputChannel: vscode.LogOutputChannel;

let sfgeCachePath: string = null;

let settingsManager: SettingsManager = null;

// Create a Set to store saved file paths
const savedFilesCache: Set<string> = new Set();

const apexPmdFixer = new ApexPmdViolationsFixer();

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
	settingsManager = new SettingsManagerImpl();

	// We need to do this first in case any other services need access to those provided by the core extension.
	await CoreExtensionService.loadDependencies(context, outputChannel);
	telemetryService = new TelemetryServiceImpl();

	const apexGuruFeatureFlag = settingsManager.getApexGuruEnabled();
	const apexGuruEnabled = apexGuruFeatureFlag && await ApexGuruFunctions.isApexGuruEnabledInOrg(outputChannel);
	// Set the necessary flags to control showing the command
	await vscode.commands.executeCommand('setContext', 'sfca.apexGuruEnabled', apexGuruEnabled);

	// Define a diagnostic collection in the `activate()` scope so it can be used repeatedly.
	diagnosticCollection = vscode.languages.createDiagnosticCollection('sfca');
	context.subscriptions.push(diagnosticCollection);
	const diagnosticManager: DiagnosticManagerImpl = new DiagnosticManagerImpl(diagnosticCollection);

	// Define a code action provider for generic quickfixes.
	const fixer = new Fixer();
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider({pattern: '**/**'}, fixer, {
			providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
		})
	);

	if (Constants.ENABLE_A4D_INTEGRATION) {
		// Define a code action provider for model based quickfixes.
		context.subscriptions.push(
			vscode.languages.registerCodeActionsProvider({pattern: '**/*.cls'}, apexPmdFixer, {
				providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
			})
		);
	}

	// Declare our commands.
	const runOnActiveFile = vscode.commands.registerCommand(Constants.COMMAND_RUN_ON_ACTIVE_FILE, async () => {
		if (!vscode.window.activeTextEditor) {
			throw new Error(messages.targeting.error.noFileSelected);
		}
		return _runAndDisplayScanner(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [vscode.window.activeTextEditor.document.fileName], {
			telemetryService: telemetryService,
			diagnosticManager: diagnosticManager,
			settingsManager
		});
	});
	const runOnSelected = vscode.commands.registerCommand(Constants.COMMAND_RUN_ON_SELECTED, async (selection: vscode.Uri, multiSelect?: vscode.Uri[]) => {
		const targetUris: vscode.Uri[] = multiSelect && multiSelect.length > 0
			? multiSelect
			: [selection];
		// TODO: We may wish to consider moving away from this target resolution, and just passing in files and folders
		//       as given to us. It's possible the current style could lead to overflowing the CLI when a folder has
		//       many files.
		const targetStrings: string[] = await targeting.getTargets(targetUris);
		return _runAndDisplayScanner(Constants.COMMAND_RUN_ON_SELECTED, targetStrings, {
			telemetryService: telemetryService,
			diagnosticManager: diagnosticManager,
			settingsManager
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
	registerScanOnSave({
		telemetryService,
		diagnosticManager,
		settingsManager
	});
	registerScanOnOpen({
		telemetryService,
		diagnosticManager,
		settingsManager
	});
	outputChannel.appendLine('Registered scanOnSave as part of sfdx-code-analyzer-vscode activation.');

	// It is possible that the cache was not cleared when VS Code exited the last time. Just to be on the safe side, we clear the DFA process cache at activation.
	void context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);

	const runDfaOnSelectedMethodCmd = vscode.commands.registerCommand(Constants.COMMAND_RUN_DFA_ON_SELECTED_METHOD, async () => {
		if (await _shouldProceedWithDfaRun(context)) {
			const methodLevelTarget: string[] = [await targeting.getSelectedMethod()];
			await runMethodLevelDfa(context, methodLevelTarget);
		}
	});

	sfgeCachePath = path.join(createTempDirectory(), 'sfca-graph-engine-cache.json');
	context.subscriptions.push(runOnActiveFile, runOnSelected, runDfaOnSelectedMethodCmd, removeDiagnosticsOnActiveFile, removeDiagnosticsOnSelectedFile, removeDiagnosticsInRange);

	if (apexGuruEnabled) {
		const runApexGuruOnSelectedFile = vscode.commands.registerCommand(Constants.COMMAND_RUN_APEX_GURU_ON_FILE, async (selection: vscode.Uri, multiSelect?: vscode.Uri[]) => {
			return await ApexGuruFunctions.runApexGuruOnFile(multiSelect && multiSelect.length > 0 ? multiSelect[0] : selection,
				{
					commandName: Constants.COMMAND_RUN_APEX_GURU_ON_FILE,
					diagnosticCollection,
					outputChannel: outputChannel
				});
		});
		const runApexGuruOnCurrentFile = vscode.commands.registerCommand(Constants.COMMAND_RUN_APEX_GURU_ON_ACTIVE_FILE, async () => {
			const targets: string[] = await targeting.getTargets([]);
			return await ApexGuruFunctions.runApexGuruOnFile(vscode.Uri.file(targets[0]),
				{
					commandName: Constants.COMMAND_RUN_APEX_GURU_ON_ACTIVE_FILE,
					diagnosticCollection,
					outputChannel: outputChannel
				});
		});
		const insertApexGuruSuggestions = vscode.commands.registerCommand(Constants.COMMAND_INCLUDE_APEX_GURU_SUGGESTIONS, async (document: vscode.TextDocument, position: vscode.Position, suggestedCode: string) => {
			const edit = new vscode.WorkspaceEdit();
			edit.insert(document.uri, position, suggestedCode);
			await vscode.workspace.applyEdit(edit);
			telemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_APEX_GURU_FILE_ANALYSIS, {
				executedCommand: Constants.COMMAND_INCLUDE_APEX_GURU_SUGGESTIONS,
				lines: suggestedCode.split('\n').length.toString()
			});
		})
		context.subscriptions.push(runApexGuruOnSelectedFile, runApexGuruOnCurrentFile, insertApexGuruSuggestions);
	}

	if (settingsManager.getSfgePartialSfgeRunsEnabled()) {
		await vscode.commands.executeCommand('setContext', 'sfca.partialRunsEnabled', true);
		const runDfaOnWorkspaceCmd = vscode.commands.registerCommand(Constants.COMMAND_RUN_DFA, async () => {
			await _runDfa(context);
			savedFilesCache.clear();
		});
		context.subscriptions.push(runDfaOnWorkspaceCmd);
	}

	const documentSaveListener = vscode.workspace.onDidSaveTextDocument(document => {
        const filePath = document.uri.fsPath;
        savedFilesCache.add(filePath);
    });
	context.subscriptions.push(documentSaveListener);

	telemetryService.sendExtensionActivationEvent(extensionHrStart);
	setupUnifiedDiff(context, diagnosticManager);
	outputChannel.appendLine(`Extension sfdx-code-analyzer-vscode activated.`);
	return Promise.resolve(context);
}


function setupUnifiedDiff(context: vscode.ExtensionContext, diagnosticManager: DiagnosticManager) {
	context.subscriptions.push(
			vscode.commands.registerCommand(Constants.UNIFIED_DIFF, async (code: string, file?: string) => {
				await VSCodeUnifiedDiff.singleton.unifiedDiff(code, file);
			})
	);
	context.subscriptions.push(
			vscode.commands.registerCommand(Constants.UNIFIED_DIFF_ACCEPT, async (hunk: DiffHunk, range: vscode.Range) => {
				await VSCodeUnifiedDiff.singleton.unifiedDiffAccept(hunk);
				apexPmdFixer.removeDiagnosticsWithInRange(vscode.window.activeTextEditor.document.uri, range, diagnosticCollection);
			})
	);
	context.subscriptions.push(
			vscode.commands.registerCommand(Constants.UNIFIED_DIFF_REJECT, async (hunk: DiffHunk) => {
				await VSCodeUnifiedDiff.singleton.unifiedDiffReject(hunk);
			})
	);
	context.subscriptions.push(
			vscode.commands.registerCommand(Constants.UNIFIED_DIFF_ACCEPT_ALL, async () => {
				await VSCodeUnifiedDiff.singleton.unifiedDiffAcceptAll();
				// For accept all, it is tricky to get all the code that gets accepted and to remove them from diagnostic.
				// Hence, we save the file and rerun the scan instead.
				await vscode.window.activeTextEditor.document.save();
				return _runAndDisplayScanner(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [vscode.window.activeTextEditor.document.fileName], {
					telemetryService,
					diagnosticManager,
					settingsManager
				});
			})
	);
	context.subscriptions.push(
			vscode.commands.registerCommand(Constants.UNIFIED_DIFF_REJECT_ALL, async () => {
				await VSCodeUnifiedDiff.singleton.unifiedDiffRejectAll();
			})
	);
	VSCodeUnifiedDiff.singleton.activate(context);
}

async function runMethodLevelDfa(context: vscode.ExtensionContext, methodLevelTarget: string[]) {
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
		// Pull out the file from the target and use it to identify the project directory.
		const currentFile: string = methodLevelTarget[0].substring(0, methodLevelTarget.lastIndexOf('#'));
		const projectDir: string = targeting.getProjectDir(currentFile);

		return _runAndDisplayDfa(context, {
			commandName: Constants.COMMAND_RUN_DFA_ON_SELECTED_METHOD
		}, customCancellationToken, methodLevelTarget, projectDir, telemetryService);
	});
}

export function createTempDirectory(): string {
	const tempFolderPrefix = path.join(os.tmpdir(), Constants.EXTENSION_PACK_ID);
	try {
		const folder = fs.mkdtempSync(tempFolderPrefix);
		return folder;
	} catch (err) {
		throw new Error('Failed to create temporary directory');
	}
}

async function _runDfa(context: vscode.ExtensionContext) {
	if (violationsCacheExists()) {
		const partialScanText = 'Partial scan: Scan only the code that you changed since the previous scan.';
		const fullScanText = 'Full scan: Scan all the code in this project again.';
		const choice = await vscode.window.showQuickPick(
			[partialScanText, fullScanText],
			{
				placeHolder: 'You previously scanned this code using Salesforce Graph Engine. What kind of scan do you want to run now?',
				canPickMany: false,
				ignoreFocusOut: true
			}
		);

		// Default to "Yes" if no choice is made
		const rerunChangedOnly = choice == partialScanText;
		if (rerunChangedOnly) {
			const deltaRunTargets = DeltaRunFunctions.getDeltaRunTarget(sfgeCachePath, savedFilesCache);
			if (deltaRunTargets.length == 0) {
				void vscode.window.showInformationMessage("Your local changes didn't change the outcome of the previous full Salesforce Graph Engine scan.");
				return
			}
			await runDfaOnSelectMethods(context, deltaRunTargets);
		} else {
			void vscode.window.showWarningMessage('A full Salesforce Graph Engine scan is running in the background. You can cancel it by clicking the progress bar.');
			await runDfaOnWorkspace(context);
		}
	} else {
		await runDfaOnWorkspace(context);
	}
}

async function runDfaOnSelectMethods(context: vscode.ExtensionContext, selectedMethods: string[]) {
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
			await vscode.window.showInformationMessage(messages.graphEngine.noViolationsFoundForPartialRuns);
			return;
		});

		// We only have one project loaded on VSCode at once. So, projectDir should have only one entry and we use
		// the root directory of that project as the projectDir argument to run DFA.
		return _runAndDisplayDfa(context, {
			commandName: Constants.COMMAND_RUN_DFA
		}, customCancellationToken, selectedMethods, targeting.getProjectDir(), telemetryService, sfgeCachePath);
	});
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
			commandName: Constants.COMMAND_RUN_DFA
		}, customCancellationToken, null, targeting.getProjectDir(), telemetryService, sfgeCachePath);
	});
}

function violationsCacheExists() {
	return fs.existsSync(sfgeCachePath);
}

export function _removeDiagnosticsInRange(uri: vscode.Uri, range: vscode.Range, diagnosticCollection: vscode.DiagnosticCollection) {
	const currentDiagnostics = diagnosticCollection.get(uri) || [];
	const updatedDiagnostics = currentDiagnostics.filter(diagnostic => (diagnostic.range.start.line != range.start.line && diagnostic.range.end.line != range.end.line));
	diagnosticCollection.set(uri, updatedDiagnostics);
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

export function registerScanOnSave(dependencies: ScannerDependencies) {
	vscode.workspace.onDidSaveTextDocument(
		async (textDocument: vscode.TextDocument) => {
			if (
				settingsManager.getAnalyzeOnSave()
			) {
				await _runAndDisplayScanner(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [textDocument.fileName], dependencies);
			}
		}
	);
}

export function registerScanOnOpen(dependencies: ScannerDependencies) {
	vscode.workspace.onDidOpenTextDocument(
		async (textDocument: vscode.TextDocument) => {
			const documentUri = textDocument.uri;
			if (
				settingsManager.getAnalyzeOnOpen()
			) {
				if (_isValidFileForAnalysis(documentUri)) {
					await _runAndDisplayScanner(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [textDocument.fileName], dependencies);
				}
			}
		}
	);
}

/**
 * Runs the scanner against the specified file and displays the results.
 * @param commandName The command being run
 * @param targets The files/folders to run against
 * @param dependencies Service dependencies
 * @returns
 */
export async function _runAndDisplayScanner(commandName: string, targets: string[], dependencies: ScannerDependencies): Promise<void> {
	const diagnosticManager: DiagnosticManager = dependencies.diagnosticManager;
	const telemetryService: TelemetryService = dependencies.telemetryService;
	const settingsManager: SettingsManager = dependencies.settingsManager;
	const startTime = Date.now();
	try {
		return await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification
		}, async (progress) => {
			const display: UxDisplay = new UxDisplay(new VSCodeDisplayable((notif: ProgressNotification) => progress.report(notif)));
			const scannerStrategy = settingsManager.getCodeAnalyzerV5Enabled()
				? new NoOpScannerStrategy()
				: new CliScannerV4Strategy({
					engines: settingsManager.getEnginesToRun(),
					pmdCustomConfigFile: settingsManager.getPmdCustomConfigFile(),
					rulesCategory: settingsManager.getRulesCategory(),
					normalizeSeverity: settingsManager.getNormalizeSeverityEnabled()
				});
			const actionDependencies = {
				scannerStrategy,
				diagnosticManager,
				display,
				telemetryService,
			};
			const scannerAction = new ScannerAction(commandName, actionDependencies);
			await scannerAction.runScanner(targets);
		});
	} catch (e) {
		const errMsg = e instanceof Error ? e.message : e as string;
		console.log(errMsg);
		telemetryService.sendException(Constants.TELEM_FAILED_STATIC_ANALYSIS, errMsg, {
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
export async function _runAndDisplayDfa(context:vscode.ExtensionContext ,runInfo: RunInfo,
	cancelToken: vscode.CancellationTokenSource, methodLevelTarget: string[], projectDir: string,
	telemetryService: TelemetryService, cacheFilePath?: string): Promise<void> {
	const {
		commandName
	} = runInfo;
	const startTime = Date.now();
	try {
		await verifyPluginInstallation();
		const results = await new ScanRunner().runDfa(methodLevelTarget, projectDir, context, cacheFilePath);
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
		telemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_DFA_ANALYSIS, {
			executedCommand: commandName,
			duration: (Date.now() - startTime).toString()
		})
	} catch (e) {
		const errMsg = e instanceof Error ? e.message : e as string;
		console.log(errMsg);
		telemetryService.sendException(Constants.TELEM_FAILED_DFA_ANALYSIS, errMsg, {
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

		telemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_STATIC_ANALYSIS, {
			executedCommand: commandName,
			duration: (Date.now() - startTime).toString()
		});
	} catch (e) {
        const errMsg = e instanceof Error ? e.message : e as string;
        console.log(errMsg);
        telemetryService.sendException(Constants.TELEM_FAILED_STATIC_ANALYSIS, errMsg, {
            executedCommand: commandName,
            duration: (Date.now() - startTime).toString()
        });
        outputChannel.error(errMsg);
        outputChannel.show();
    }
}

// This method is called when your extension is deactivated
export function deactivate() {
	telemetryService.dispose();
	savedFilesCache.clear();
}

export function _isValidFileForAnalysis(documentUri: vscode.Uri) {
	const allowedFileTypes:string[] = ['.cls', '.js', '.apex', '.trigger', '.ts'];
	return allowedFileTypes.includes(path.extname(documentUri.path));
}

class VSCodeDisplayable implements Displayable {
	private readonly progressCallback: (ProgressNotification) => void;

	public constructor(progressCallback: (ProgressNotification) => void) {
		this.progressCallback = progressCallback;
	}

	public progress(notification: ProgressNotification): void {
		this.progressCallback(notification);
	}

	/**
	 * Display a Toast summarizing the results of a non-DFA scan, i.e. how many files were scanned, how many had violations, and how many violations were found.
	 * @param allTargets The files that were scanned. This may be a superset of the files that actually had violations.
	 * @param results The results of a scan.
	 */
	public async results(allTargets: string[], results: DiagnosticConvertible[]): Promise<void> {
		const uniqueFiles: Set<string> = new Set();
		for (const result of results) {
			uniqueFiles.add(result.locations[result.primaryLocationIndex].file);
		}
		await vscode.window.showInformationMessage(messages.info.finishedScan(allTargets.length, uniqueFiles.size, results.length));
	}
}
