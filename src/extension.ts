/*
 * Copyright (c) 2025, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {SettingsManager, SettingsManagerImpl} from './lib/settings';
import * as targeting from './lib/targeting'
import {CodeAnalyzerDiagnostic, DiagnosticManager, DiagnosticManagerImpl} from './lib/diagnostics';
import {messages} from './lib/messages';
import * as Constants from './lib/constants';
import * as path from 'path';
import {ExternalServiceProvider} from "./lib/external-services/external-service-provider";
import {Logger, LoggerImpl} from "./lib/logger";
import {TelemetryService} from "./lib/external-services/telemetry-service";
import {CodeAnalyzerRunAction} from "./lib/code-analyzer-run-action";
import {A4DFixActionProvider} from "./lib/agentforce/a4d-fix-action-provider";
import {ScanManager} from './lib/scan-manager';
import {A4DFixAction} from './lib/agentforce/a4d-fix-action';
import {UnifiedDiffService, UnifiedDiffServiceImpl} from "./lib/unified-diff-service";
import {Display, VSCodeDisplay} from "./lib/display";
import {CodeAnalyzer, CodeAnalyzerImpl} from "./lib/code-analyzer";
import {TaskWithProgressRunner, TaskWithProgressRunnerImpl} from "./lib/progress";
import {CliCommandExecutor, CliCommandExecutorImpl} from "./lib/cli-commands";
import {getErrorMessage} from "./lib/utils";
import {FileHandler, FileHandlerImpl} from "./lib/fs-utils";
import {VscodeWorkspace, VscodeWorkspaceImpl, WindowManager, WindowManagerImpl} from "./lib/vscode-api";
import {Workspace} from "./lib/workspace";
import {PMDSupressionsCodeActionProvider} from './lib/pmd/pmd-suppressions-code-action-provider';
import {ApplyViolationFixesActionProvider} from './lib/apply-violation-fixes-action-provider';
import {ApplyViolationFixesAction} from './lib/apply-violation-fixes-action';
import {ViolationSuggestionsHoverProvider} from './lib/violation-suggestions-hover-provider';
import {ApexGuruAccess, ApexGuruAvailability, ApexGuruService, LiveApexGuruService} from './lib/apexguru/apex-guru-service';
import {ApexGuruRunAction} from './lib/apexguru/apex-guru-run-action';
import {OrgConnectionService} from './lib/external-services/org-connection-service';


// Object to hold the state of our extension for a specific activation context, to be returned by our activate function
// Ideally, we shouldn't need this anywhere, but it does allow external extensions to be able to get access to this data
// from the doing:
//   const sfcaExt: Extension<SFCAExtensionData> = vscode.extensions.getExtension('salesforce.sfdx-code-analyzer-vscode');
//   const data: SFCAExtensionData = sfcaExt.exports; // or from the return of sfca.activate() if sfca.isActive is false.
export type SFCAExtensionData = {
    logger: Logger
    settingsManager: SettingsManager
    diagnosticManager: DiagnosticManager
    context: vscode.ExtensionContext
}

/**
 * This method is invoked when the extension is first activated (this is currently configured to be when a sfdx project is loaded).
 * The activation trigger can be changed by changing activationEvents in package.json
 * Registers the necessary diagnostic collections and commands.
 */
export async function activate(context: vscode.ExtensionContext): Promise<SFCAExtensionData> {
    const highResStartTime: number = globalThis.performance.now();

    // Helpers to keep the below code clean and so that we don't forget to push the disposables onto the context
    const registerCommand = (command: string, callback: (...args: unknown[]) => unknown): void => {
        context.subscriptions.push(vscode.commands.registerCommand(command, callback));
    };
    const registerCodeActionsProvider = (selector: vscode.DocumentSelector, provider: vscode.CodeActionProvider, metadata?: vscode.CodeActionProviderMetadata): void => {
        context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selector, provider, metadata));
    }
    const registerHoverProvider = (selector: vscode.DocumentSelector, provider: vscode.HoverProvider): void => {
        context.subscriptions.push(vscode.languages.registerHoverProvider(selector, provider));
    }
    const onDidSaveTextDocument = (listener: (e: unknown) => unknown): void => {
        context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(listener));
    }
    const onDidChangeActiveTextEditor = (listener: (e: unknown) => unknown): void => {
        context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(listener));
    }

    // Prepare utilities
    const outputChannel: vscode.LogOutputChannel = vscode.window.createOutputChannel('Salesforce Code Analyzer', {log: true});
    outputChannel.clear();
    const diagnosticCollection: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection('sfca');
    const logger: Logger = new LoggerImpl(outputChannel);
    const display: VSCodeDisplay = new VSCodeDisplay(logger);
    const settingsManager = new SettingsManagerImpl();
    const externalServiceProvider: ExternalServiceProvider = new ExternalServiceProvider(logger, context);
    const telemetryService: TelemetryService = await externalServiceProvider.getTelemetryService();
    const orgConnectionService: OrgConnectionService = await externalServiceProvider.getOrgConnectionService();
    const diagnosticManager: DiagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);
    vscode.workspace.onDidChangeTextDocument(e => diagnosticManager.handleTextDocumentChangeEvent(e));
    context.subscriptions.push(diagnosticManager);
    const scanManager: ScanManager = new ScanManager(); // TODO: We will be moving more of scanning stuff into the scan manager soon
    context.subscriptions.push(scanManager);

    const windowManager: WindowManager = new WindowManagerImpl(outputChannel);
    const vscodeWorkspace: VscodeWorkspace = new VscodeWorkspaceImpl();

    const taskWithProgressRunner: TaskWithProgressRunner = new TaskWithProgressRunnerImpl();


    const cliCommandExecutor: CliCommandExecutor = new CliCommandExecutorImpl(logger);
    const fileHandler: FileHandler = new FileHandlerImpl();
    const codeAnalyzer: CodeAnalyzer = new CodeAnalyzerImpl(cliCommandExecutor, settingsManager, display, fileHandler);

    const codeAnalyzerRunAction: CodeAnalyzerRunAction = new CodeAnalyzerRunAction(taskWithProgressRunner, codeAnalyzer, diagnosticManager, telemetryService, logger, display, windowManager);

    // For performance reasons, it's best to kick this off in the background instead of await the promise.
    void performValidationAndCaching(codeAnalyzer, display);


    // =================================================================================================================
    // ==  Code Analyzer Run Functionality
    // =================================================================================================================

    // COMMAND_RUN_ON_ACTIVE_FILE: Invokable by 'commandPalette' and 'editor/context' menu always.
    registerCommand(Constants.COMMAND_RUN_ON_ACTIVE_FILE, async () => {
        const document: vscode.TextDocument = await getActiveDocument();
        if (document === null) {
            vscode.window.showWarningMessage(messages.noActiveEditor);
            return;
        }
        const workspace: Workspace = await Workspace.fromTargetPaths([document.fileName], vscodeWorkspace, fileHandler);
        return codeAnalyzerRunAction.run(Constants.COMMAND_RUN_ON_ACTIVE_FILE, workspace);
    });

    // "Analyze On Open" and "Analyze on Save" functionality:
    onDidChangeActiveTextEditor(async (editor: vscode.TextEditor) => {
        if (!settingsManager.getAnalyzeOnOpen()) {
            return; // Do nothing if "Analyze On Open" is not enabled
        }
        const isFile: boolean = editor !== undefined && editor.document.uri.scheme === 'file';
        const isValidFile: boolean = isFile && _isValidFileForAnalysis(editor.document.uri);
        const isValidFileThatHasNotBeenScannedYet = isValidFile && !scanManager.haveAlreadyScannedFile(editor.document.fileName);
        if (isValidFileThatHasNotBeenScannedYet) {
            scanManager.addFileToAlreadyScannedFiles(editor.document.fileName);
            const workspace: Workspace = await Workspace.fromTargetPaths([editor.document.fileName], vscodeWorkspace, fileHandler);
            await codeAnalyzerRunAction.run(Constants.COMMAND_RUN_ON_ACTIVE_FILE, workspace);
        }
    });
    onDidSaveTextDocument(async (document: vscode.TextDocument) => {
        const isFile: boolean = document !== undefined && document.uri.scheme === 'file';
        const isValidFile: boolean = isFile && _isValidFileForAnalysis(document.uri);
        if (!isValidFile) {
            return;
        }
        // If a file has been saved, then it means it most likely has been modified and may need to be scanned again,
        // so we remove it from the already scanned list.
        scanManager.removeFileFromAlreadyScannedFiles(document.fileName);

        if (settingsManager.getAnalyzeOnSave()) {
            scanManager.addFileToAlreadyScannedFiles(document.fileName);
            const workspace: Workspace = await Workspace.fromTargetPaths([document.fileName], vscodeWorkspace, fileHandler);
            await codeAnalyzerRunAction.run(Constants.COMMAND_RUN_ON_ACTIVE_FILE, workspace);
        }
    });

    // COMMAND_RUN_ON_SELECTED: Invokable by 'explorer/context' menu always.
    registerCommand(Constants.COMMAND_RUN_ON_SELECTED, async (singleSelection: vscode.Uri, multiSelection?: vscode.Uri[]) => {
        const selection: vscode.Uri[] = (multiSelection && multiSelection.length > 0) ? multiSelection : [singleSelection];
        const workspace: Workspace = await Workspace.fromTargetPaths(selection.map(uri => uri.fsPath), vscodeWorkspace, fileHandler);
        if (workspace.getRawTargetPaths().length == 0) { // I have not found a way to hit this, but we should check just in case
            vscode.window.showWarningMessage(messages.targeting.error.noFileSelected);
            return;
        }
        await codeAnalyzerRunAction.run(Constants.COMMAND_RUN_ON_SELECTED, workspace);
    });


    // =================================================================================================================
    // ==  Diagnostic Management Functionality
    // =================================================================================================================

    // TODO: We should look to see if we can make these commands appear conditionally upon whether we have diagnostics
    //       present instead of always showing them. Maybe there is a way to watch the diagnostics changing.

    // COMMAND_REMOVE_DIAGNOSTICS_ON_ACTIVE_FILE: Invokable by 'commandPalette' and 'editor/context' always
    registerCommand(Constants.COMMAND_REMOVE_DIAGNOSTICS_ON_ACTIVE_FILE, async () => {
        const document: vscode.TextDocument = await getActiveDocument();
        if (document === null) {
            vscode.window.showWarningMessage(messages.noActiveEditor);
            return;
        }
        diagnosticManager.clearDiagnosticsForFiles([document.uri]);
    });

    // COMMAND_REMOVE_DIAGNOSTICS_ON_SELECTED_FILE: Invokable by 'explorer/context' always
    // ... and also invoked by a Quick Fix button that appears on diagnostics. TODO: This should change because we should only be suppressing diagnostics of a specific type - not all of them.
    registerCommand(Constants.COMMAND_REMOVE_DIAGNOSTICS_ON_SELECTED_FILE, async (singleSelection: vscode.Uri, multiSelection?: vscode.Uri[]) => {
        const selection: vscode.Uri[] = (multiSelection && multiSelection.length > 0) ? multiSelection : [singleSelection];
        const selectedFiles: string[] = await targeting.getFilesFromSelection(selection);
        diagnosticManager.clearDiagnosticsForFiles(selectedFiles.map(f => vscode.Uri.file(f)));
    });


    // =================================================================================================================
    // ==  Code Analyzer PMD Quick-Fix Functionality for Line or Class Level Suppressions
    // =================================================================================================================
    const pmdSuppressionsCodeActionProvider: PMDSupressionsCodeActionProvider = new PMDSupressionsCodeActionProvider();
    registerCodeActionsProvider({language: 'apex'}, pmdSuppressionsCodeActionProvider,
            {providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]});

    // QF_COMMAND_DIAGNOSTICS_IN_RANGE: Invoked by a Quick Fix button that appears on diagnostics
    // TODO: We need to fix this - because we should be just removing the relevant diagnostics - not all in a specific range
    registerCommand(Constants.QF_COMMAND_DIAGNOSTICS_IN_RANGE, (uri: vscode.Uri, range: vscode.Range) =>
        diagnosticManager.clearDiagnosticsInRange(uri, range));


    // =================================================================================================================
    // ==  Unified Diff Service
    // =================================================================================================================
    const unifiedDiffService: UnifiedDiffService = new UnifiedDiffServiceImpl(settingsManager, display);
    unifiedDiffService.register();
    context.subscriptions.push(unifiedDiffService);


    // =================================================================================================================
    // ==  Apply Violation Fixes Functionality
    // =================================================================================================================
    const applyViolationFixesAction: ApplyViolationFixesAction = new ApplyViolationFixesAction(
        unifiedDiffService, diagnosticManager, telemetryService, logger, display);
    const applyViolationFixesActionProvider: ApplyViolationFixesActionProvider = new ApplyViolationFixesActionProvider();
    registerCommand(ApplyViolationFixesAction.COMMAND, async (diagnostic: CodeAnalyzerDiagnostic, document: vscode.TextDocument) => {
        await applyViolationFixesAction.run(diagnostic, document);
    });
    registerCodeActionsProvider({pattern: '**/**'}, applyViolationFixesActionProvider,
        {providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]});


    // =================================================================================================================
    // ==  Violation Suggestions Functionality
    // =================================================================================================================
    registerCommand(Constants.COMMAND_COPY_SUGGESTION, async (engineName: string, ruleName: string, suggestionMessage: string) => {
        await vscode.env.clipboard.writeText(suggestionMessage);
        vscode.window.showInformationMessage(messages.suggestions.suggestionCopiedToClipboard(engineName, ruleName));
        telemetryService.sendCommandEvent(Constants.TELEM_COPY_SUGGESTION_CLICKED, {
            commandSource: Constants.COMMAND_COPY_SUGGESTION,
            engineName: engineName,
            ruleName: ruleName
        });
    });
    const violationSuggestionsHolverProvider: ViolationSuggestionsHoverProvider = new ViolationSuggestionsHoverProvider(
        diagnosticManager);
    registerHoverProvider({pattern: '**/**'}, violationSuggestionsHolverProvider);

    // =================================================================================================================
    // ==  Apex Guru Integration Functionality
    // =================================================================================================================
    const apexGuruService: ApexGuruService = new LiveApexGuruService(orgConnectionService, fileHandler, logger);
    const apexGuruRunAction: ApexGuruRunAction = new ApexGuruRunAction(taskWithProgressRunner, apexGuruService, diagnosticManager, telemetryService, display);

    // TODO: This is temporary and will change soon when we remove pilot flag and instead add a watch to org auth changes
    const isApexGuruEnabled: () => Promise<boolean> = async () => {
        if (!settingsManager.getApexGuruEnabled()) {
            return false;
        }
        const availability: ApexGuruAvailability = await apexGuruService.getAvailability();
        if (availability.access === ApexGuruAccess.ENABLED || availability.access === ApexGuruAccess.ELIGIBLE) {
            return true;
        }
    };
    await establishVariableInContext(Constants.CONTEXT_VAR_APEX_GURU_ENABLED, isApexGuruEnabled);

    // COMMAND_RUN_APEX_GURU_ON_FILE: Invokable by 'explorer/context' menu only when: "sfca.apexGuruEnabled && explorerResourceIsFolder == false && resourceExtname =~ /\\.cls|\\.trigger|\\.apex/"
    registerCommand(Constants.COMMAND_RUN_APEX_GURU_ON_FILE, async (selection: vscode.Uri, multiSelect?: vscode.Uri[]) => {
        if (multiSelect?.length > 1) {
            display.displayWarning(messages.apexGuru.warnings.canOnlyScanOneFile(selection.fsPath));
        }
        await apexGuruRunAction.run(Constants.COMMAND_RUN_APEX_GURU_ON_FILE, selection);
    });

    // COMMAND_RUN_APEX_GURU_ON_ACTIVE_FILE: Invokable by 'commandPalette' and 'editor/context' menus only when: "sfca.apexGuruEnabled && resourceExtname =~ /\\.cls|\\.trigger|\\.apex/"
    registerCommand(Constants.COMMAND_RUN_APEX_GURU_ON_ACTIVE_FILE, async () => {
        const document: vscode.TextDocument = await getActiveDocument();
        if (document === null) {
            vscode.window.showWarningMessage(messages.noActiveEditor);
            return;
        }
        return await apexGuruRunAction.run(Constants.COMMAND_RUN_APEX_GURU_ON_ACTIVE_FILE, document.uri);
    });
    

    // =================================================================================================================
    // ==  Agentforce for Developers Integration
    // =================================================================================================================
    const a4dFixAction: A4DFixAction = new A4DFixAction(externalServiceProvider, codeAnalyzer, unifiedDiffService, 
        diagnosticManager, telemetryService, logger, display);
    const a4dFixActionProvider: A4DFixActionProvider = new A4DFixActionProvider(externalServiceProvider, logger);
    registerCommand(A4DFixAction.COMMAND, async (diagnostic: CodeAnalyzerDiagnostic, document: vscode.TextDocument) => {
        await a4dFixAction.run(diagnostic, document);
    });
    // Invoked by the "quick fix" buttons on A4D enabled diagnostics
    registerCodeActionsProvider({language: 'apex'}, a4dFixActionProvider,
        {providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]});


    // =================================================================================================================
    // ==  Finalize activation
    // =================================================================================================================

    telemetryService.sendExtensionActivationEvent(highResStartTime);
    await vscode.commands.executeCommand('setContext', Constants.CONTEXT_VAR_EXTENSION_ACTIVATED, true);
    logger.log('Extension sfdx-code-analyzer-vscode activated.');
    return {
        logger: logger,
        settingsManager: settingsManager,
        diagnosticManager: diagnosticManager,
        context: context
    };
}


// This method is called when your extension is deactivated
export async function deactivate(): Promise<void> {
    await vscode.commands.executeCommand('setContext', Constants.CONTEXT_VAR_EXTENSION_ACTIVATED, false);
}

// TODO: We either need to give the user control over which files the auto-scan on open/save feature works for...
//       ... or we need to somehow determine dynamically if the file is relevant for scanning using the
//       ... --workspace option. I think that regex has situations that work on all
//       ....files. So we might not be able to get this perfect. Need to discuss this soon.
export function _isValidFileForAnalysis(documentUri: vscode.Uri): boolean {
    const allowedFileTypes:string[] = ['.cls', '.js', '.apex', '.trigger', '.ts', '.xml'];
    return allowedFileTypes.includes(path.extname(documentUri.fsPath));
}

// TODO: This is only used by apex guru right now and is tied to the pilot setting. Soon we will be removing the pilot
// setting and instead we should be adding a watch to the onOrgChange event of the OrgConnectionService instead.
// Inside our package.json you'll see things like:
//     "when": "sfca.apexGuruEnabled"
// which helps determine when certain commands and menus are available.
// To make these "context variables" set and stay updated when settings change, use this helper function:
async function establishVariableInContext(varUsedInPackageJson: string, getValueFcn: () => Promise<boolean>): Promise<void> {
    await vscode.commands.executeCommand('setContext', varUsedInPackageJson, await getValueFcn());
    vscode.workspace.onDidChangeConfiguration(async () => {
        await vscode.commands.executeCommand('setContext', varUsedInPackageJson, await getValueFcn());
    });
}

async function getActiveDocument(): Promise<vscode.TextDocument | null> {
    // Note that the active editor window could be the output window instead of the actual file editor, so we
    // force focus it first to ensure we are getting the correct editor
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    if (!vscode.window.activeTextEditor) {
        return null;
    }
    return vscode.window.activeTextEditor.document;
}


/**
 * Perform some validation and caching ahead of time instead of waiting for a scan to take place.
 */
async function performValidationAndCaching(codeAnalyzer: CodeAnalyzer, display: Display): Promise<void> {
    try {
        await codeAnalyzer.validateEnvironment();
        // Note: We might consider adding in additional things here like for getting the rule descriptions, etc.
    } catch (err) {
        display.displayError(getErrorMessage(err));
    }
}
