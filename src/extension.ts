/*
 * Copyright (c) 2023, Salesforce, Inc.
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
import {Fixer} from './lib/fixer';
import {CoreExtensionService} from './lib/core-extension-service';
import * as Constants from './lib/constants';
import * as path from 'path';
import * as ApexGuruFunctions from './lib/apexguru/apex-guru-service';
import {AgentforceViolationFixer} from './lib/agentforce/agentforce-violation-fixer'
import {
    CODEGENIE_UNIFIED_DIFF_ACCEPT,
    CODEGENIE_UNIFIED_DIFF_ACCEPT_ALL,
    CODEGENIE_UNIFIED_DIFF_REJECT,
    CODEGENIE_UNIFIED_DIFF_REJECT_ALL,
    DiffHunk,
    VSCodeUnifiedDiff
} from './shared/UnifiedDiff';
import {ExternalServiceProvider} from "./lib/external-services/external-service-provider";
import {Logger, LoggerImpl} from "./lib/logger";
import {TelemetryService} from "./lib/external-services/telemetry-service";
import {DfaRunner} from "./lib/dfa-runner";
import {CodeAnalyzerRunner} from "./lib/code-analyzer-runner";
import {AgentforceCodeActionProvider} from "./lib/agentforce/agentforce-code-action-provider";
import {UnifiedDiffActions} from "./lib/unified-diff/unified-diff-actions";
import {CodeGenieUnifiedDiffTool, UnifiedDiffTool} from "./lib/unified-diff/unified-diff-tool";
import {FixSuggestion} from "./lib/fix-suggestion";
import {ScanManager} from './lib/scan-manager';


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
    const extensionHrStart: [number, number] = process.hrtime();

    // Helpers to keep the below code clean and so that we don't forget to push the disposables onto the context
    const registerCommand = (command: string, callback: (...args: unknown[]) => unknown): void => {
        context.subscriptions.push(vscode.commands.registerCommand(command, callback));
    };
    const registerCodeActionsProvider = (selector: vscode.DocumentSelector, provider: vscode.CodeActionProvider, metadata?: vscode.CodeActionProviderMetadata): void => {
        context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selector, provider, metadata));
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
    const settingsManager = new SettingsManagerImpl();
    const externalServiceProvider: ExternalServiceProvider = new ExternalServiceProvider(logger);
    const telemetryService: TelemetryService = await externalServiceProvider.getTelemetryService();
    const dfaRunner: DfaRunner = new DfaRunner(context, telemetryService, logger);
    context.subscriptions.push(dfaRunner);
    const diagnosticManager: DiagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);
    vscode.workspace.onDidChangeTextDocument(e => diagnosticManager.handleTextDocumentChangeEvent(e));
    context.subscriptions.push(diagnosticManager);
    const codeAnalyzerRunner: CodeAnalyzerRunner = new CodeAnalyzerRunner(diagnosticManager, settingsManager, telemetryService, logger);
    const scanManager: ScanManager = new ScanManager(); // TODO: We will be moving more of scanning stuff into the scan manager soon
    context.subscriptions.push(scanManager);


    // We need to do this first in case any other services need access to those provided by the core extension.
    // TODO: Soon we should get rid of this CoreExtensionService stuff in favor of putting things inside of the ExternalServiceProvider
    await CoreExtensionService.loadDependencies(outputChannel);


    // =================================================================================================================
    // ==  Code Analyzer Run Functionality
    // =================================================================================================================
    await establishVariableInContext('sfca.codeAnalyzerV4Enabled', () => Promise.resolve(settingsManager.getCodeAnalyzerUseV4Deprecated()));

    // Monitor the "codeAnalyzer.Use v4 (Deprecated)" setting with telemetry
    vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
        if (event.affectsConfiguration('codeAnalyzer.Use v4 (Deprecated)')) {
            telemetryService.sendCommandEvent(Constants.TELEM_SETTING_USEV4, {
                value: settingsManager.getCodeAnalyzerUseV4Deprecated().toString()});
        }
    });

    // COMMAND_RUN_ON_ACTIVE_FILE: Invokable by 'commandPalette' and 'editor/context' menu always. Uses v4 instead of v5 when 'sfca.codeAnalyzerV4Enabled'.
    registerCommand(Constants.COMMAND_RUN_ON_ACTIVE_FILE, async () => {
        const document: vscode.TextDocument = await getActiveDocument();
        if (document === null) {
            vscode.window.showWarningMessage(messages.noActiveEditor);
            return;
        }
        return codeAnalyzerRunner.runAndDisplay(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [document.fileName]);
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
            await codeAnalyzerRunner.runAndDisplay(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [editor.document.fileName]);
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
            await codeAnalyzerRunner.runAndDisplay(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [document.fileName]);
        }
    });

    // COMMAND_RUN_ON_SELECTED: Invokable by 'explorer/context' menu always. Uses v4 instead of v5 when 'sfca.codeAnalyzerV4Enabled'.
    registerCommand(Constants.COMMAND_RUN_ON_SELECTED, async (singleSelection: vscode.Uri, multiSelection?: vscode.Uri[]) => {
        const selection: vscode.Uri[] = (multiSelection && multiSelection.length > 0) ? multiSelection : [singleSelection];
        // TODO: We may wish to consider moving away from this target resolution, and just passing in files and folders
        //       as given to us. It's possible the current style could lead to overflowing the CLI when a folder has
        //       many files.
        const selectedFiles: string[] = await targeting.getFilesFromSelection(selection);
        if (selectedFiles.length == 0) { // I have not found a way to hit this, but we should check just in case
            vscode.window.showWarningMessage(messages.targeting.error.noFileSelected);
            return;
        }
        await codeAnalyzerRunner.runAndDisplay(Constants.COMMAND_RUN_ON_SELECTED, selectedFiles);
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
    // ==  Code Analyzer Basic Quick-Fix Functionality
    // =================================================================================================================
    registerCodeActionsProvider({pattern: '**/**'}, new Fixer(), // TODO: We should separate the apex guru quick fix from this Fixer class into its own
        {providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]});

    // QF_COMMAND_DIAGNOSTICS_IN_RANGE: Invoked by a Quick Fix button that appears on diagnostics
    registerCommand(Constants.QF_COMMAND_DIAGNOSTICS_IN_RANGE, (uri: vscode.Uri, range: vscode.Range) =>
        diagnosticManager.clearDiagnosticsInRange(uri, range));


    // =================================================================================================================
    // ==  DFA Run Functionality
    // =================================================================================================================

    // It is possible that the cache was not cleared when VS Code exited the last time. Just to be on the safe side, we clear the DFA process cache at activation.
    void context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);
    await establishVariableInContext('sfca.partialRunsEnabled', () => Promise.resolve(settingsManager.getSfgePartialSfgeRunsEnabled()));

    // COMMAND_RUN_DFA_ON_SELECTED_METHOD: Invokable by 'editor/context' only when "sfca.codeAnalyzerV4Enabled"
    registerCommand(Constants.COMMAND_RUN_DFA_ON_SELECTED_METHOD, async () => {
        if (await dfaRunner.shouldProceedWithDfaRun()) {
            const methodLevelTarget: string[] = [await targeting.getSelectedMethod()];
            await dfaRunner.runMethodLevelDfa(methodLevelTarget);
        }
    });

    // COMMAND_RUN_DFA: Invokable by 'commandPalette' only when "sfca.partialRunsEnabled && sfca.codeAnalyzerV4Enabled"
    registerCommand(Constants.COMMAND_RUN_DFA, async () => {
        await dfaRunner.runDfa();
        dfaRunner.clearSavedFilesCache();
    });

    onDidSaveTextDocument((document: vscode.TextDocument) => dfaRunner.addSavedFileToCache(document.fileName));


    // =================================================================================================================
    // ==  Apex Guru Integration Functionality
    // =================================================================================================================
    const isApexGuruEnabled: () => Promise<boolean> =
        async () => settingsManager.getApexGuruEnabled() &&
            // Currently we don't watch for changes here when a user has apex guru enabled already. That is,
            // if the user logs into an org post activation of this extension, it won't show the command until they
            // refresh or toggle the "ApexGuru enabled" setting off and back on. At some point we might want to see
            // if it is possible to monitor changes to the users org so we can re-trigger this check.
            await ApexGuruFunctions.isApexGuruEnabledInOrg(logger);

    await establishVariableInContext('sfca.apexGuruEnabled', isApexGuruEnabled);

    // COMMAND_RUN_APEX_GURU_ON_FILE: Invokable by 'explorer/context' menu only when: "sfca.apexGuruEnabled && resourceExtname =~ /\\.cls|\\.trigger|\\.apex/"
    registerCommand(Constants.COMMAND_RUN_APEX_GURU_ON_FILE, async (selection: vscode.Uri, multiSelect?: vscode.Uri[]) =>
        await ApexGuruFunctions.runApexGuruOnFile(multiSelect && multiSelect.length > 0 ? multiSelect[0] : selection,
            Constants.COMMAND_RUN_APEX_GURU_ON_FILE, diagnosticManager, telemetryService, logger));

    // COMMAND_RUN_APEX_GURU_ON_ACTIVE_FILE: Invokable by 'commandPalette' and 'editor/context' menus only when: "sfca.apexGuruEnabled && resourceExtname =~ /\\.cls|\\.trigger|\\.apex/"
    registerCommand(Constants.COMMAND_RUN_APEX_GURU_ON_ACTIVE_FILE, async () => {
        const document: vscode.TextDocument = await getActiveDocument();
        if (document === null) {
            vscode.window.showWarningMessage(messages.noActiveEditor);
            return;
        }
        return await ApexGuruFunctions.runApexGuruOnFile(document.uri,
            Constants.COMMAND_RUN_APEX_GURU_ON_ACTIVE_FILE, diagnosticManager, telemetryService, logger);
    });

    // QF_COMMAND_INCLUDE_APEX_GURU_SUGGESTIONS: Invoked by a Quick Fix button that appears on diagnostics that have an "apexguru" engine name.
    registerCommand(Constants.QF_COMMAND_INCLUDE_APEX_GURU_SUGGESTIONS, async (document: vscode.TextDocument, position: vscode.Position, suggestedCode: string) => {
        const edit = new vscode.WorkspaceEdit();
        edit.insert(document.uri, position, suggestedCode);
        await vscode.workspace.applyEdit(edit);
        telemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_APEX_GURU_FILE_ANALYSIS, {
            executedCommand: Constants.QF_COMMAND_INCLUDE_APEX_GURU_SUGGESTIONS,
            lines: suggestedCode.split('\n').length.toString()
        });
    });


    // =================================================================================================================
    // ==  Agentforce for Developers Integration
    // =================================================================================================================
    const agentforceCodeActionProvider: AgentforceCodeActionProvider = new AgentforceCodeActionProvider(externalServiceProvider, logger);
    const agentforceViolationFixer: AgentforceViolationFixer = new AgentforceViolationFixer(externalServiceProvider, logger);
    const unifiedDiffTool: UnifiedDiffTool<DiffHunk> = new CodeGenieUnifiedDiffTool();
    const unifiedDiffActions: UnifiedDiffActions<DiffHunk> = new UnifiedDiffActions<DiffHunk>(unifiedDiffTool, telemetryService, logger);

    registerCodeActionsProvider({language: 'apex'}, agentforceCodeActionProvider,
            {providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]});

    // Invoked by the "quick fix" buttons on A4D enabled diagnostics
    registerCommand(Constants.QF_COMMAND_A4D_FIX, async (document: vscode.TextDocument, diagnostic: CodeAnalyzerDiagnostic) => {
        const fixSuggestion: FixSuggestion = await agentforceViolationFixer.suggestFix(document, diagnostic);
        if (!fixSuggestion) {
            return;
        }

        logger.debug(`Agentforce Fix Diff:\n` +
            `=== ORIGINAL CODE ===:\n${fixSuggestion.getOriginalCodeToBeFixed()}\n\n` +
            `=== FIXED CODE ===:\n${fixSuggestion.getFixedCode()}`);

        diagnosticManager.clearDiagnostic(diagnostic);

        // TODO: We really need to either improve or replace the CodeGenie unified diff tool. Ideally, we would be
        //  passing the fixSuggestion to some sort of callback that when the diff is rejected, restore the diagnostic
        //  that we just removed that is associated with the fix but the CodeGenie diff tool doesn't allow us to do that.

        // Display the diff with buttons that call through to the commands:
        //    CODEGENIE_UNIFIED_DIFF_ACCEPT, CODEGENIE_UNIFIED_DIFF_REJECT, CODEGENIE_UNIFIED_DIFF_ACCEPT_ALL, CODEGENIE_UNIFIED_DIFF_REJECT_ALL
        const commandSource: string = Constants.QF_COMMAND_A4D_FIX;
        await unifiedDiffActions.createDiff(commandSource, document, fixSuggestion.getFixedDocumentCode());

        if (fixSuggestion.hasExplanation()) {
            // TODO: Figure out why this window isn't showing up most times. Could it be that CodeGenie's diff is
            //       preventing it from doing so??
            void vscode.window.showInformationMessage(messages.agentforce.explanationOfFix(fixSuggestion.getExplanation()));
        }
    });


    // =================================================================================================================
    // ==  CodeGenie Unified Diff Integration
    // =================================================================================================================

    VSCodeUnifiedDiff.singleton.activate(context);

    // Invoked by the "Accept" button on the CodeGenie Unified Diff tool
    registerCommand(CODEGENIE_UNIFIED_DIFF_ACCEPT, async (diffHunk: DiffHunk) => {
        // Unfortunately the CodeGenie diff tool doesn't pass in the original source of the diff, so we hardcode
        // this for now since A4D is the only source for the unified diff so far.
        const commandSource: string = `${Constants.QF_COMMAND_A4D_FIX}>${CODEGENIE_UNIFIED_DIFF_ACCEPT}`;
        // Also, CodeGenie diff tool does not pass in the document, and so we assume it is the active one since the user clicked the button.
        const document: vscode.TextDocument = await getActiveDocument();
        await unifiedDiffActions.acceptDiffHunk(commandSource, document, diffHunk);
    });

    // Invoked by the "Reject" button on the CodeGenie Unified Diff tool
    registerCommand(CODEGENIE_UNIFIED_DIFF_REJECT, async (diffHunk: DiffHunk) => {
        // Unfortunately the CodeGenie diff tool doesn't pass in the original source of the diff, so we hardcode
        // this for now since A4D is the only source for the unified diff so far.
        const commandSource: string = `${Constants.QF_COMMAND_A4D_FIX}>${CODEGENIE_UNIFIED_DIFF_REJECT}`;
        // Also, CodeGenie diff tool does not pass in the document, and so we assume it is the active one since the user clicked the button.
        const document: vscode.TextDocument = await getActiveDocument();
        await unifiedDiffActions.rejectDiffHunk(commandSource, document, diffHunk);

        // Work Around: For reject & reject all, we really should be restoring the diagnostic that we removed
        // but CodeGenie doesn't let us keep the diagnostic information around at this point. So instead we must
        // rerun the scan instead to get the diagnostic restored.
        await document.save(); // TODO: This whole space will be refactored soon so that we don't need to do a save and rerun.
        if (!settingsManager.getAnalyzeOnSave()) {
            return codeAnalyzerRunner.runAndDisplay(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [document.fileName]);
        }
    });

    // Invoked by the "Accept All" button on the CodeGenie Unified Diff tool
    registerCommand(CODEGENIE_UNIFIED_DIFF_ACCEPT_ALL, async () => {
        // Unfortunately the CodeGenie diff tool doesn't pass in the original source of the diff, so we hardcode
        // this for now since A4D is the only source for the unified diff so far.
        const commandSource: string = `${Constants.QF_COMMAND_A4D_FIX}>${CODEGENIE_UNIFIED_DIFF_ACCEPT_ALL}`;
        // Also, CodeGenie diff tool does not pass in the document, and so we assume it is the active one since the user clicked the button.
        const document: vscode.TextDocument = await getActiveDocument();

        await unifiedDiffActions.acceptAll(commandSource, document);
    });

    // Invoked by the "Reject All" button on the CodeGenie Unified Diff tool
    registerCommand(CODEGENIE_UNIFIED_DIFF_REJECT_ALL, async () => {
        // Unfortunately the CodeGenie diff tool doesn't pass in the original source of the diff, so we hardcode
        // this for now since A4D is the only source for the unified diff so far.
        const commandSource: string = `${Constants.QF_COMMAND_A4D_FIX}>${CODEGENIE_UNIFIED_DIFF_REJECT_ALL}`;
        // Also, CodeGenie diff tool does not pass in the document, and so we assume it is the active one since the user clicked the button.
        const document: vscode.TextDocument = await getActiveDocument();
        await unifiedDiffActions.rejectAll(commandSource, document);

        // Work Around: For reject & reject all, we really should be restoring the diagnostic that we removed
        // but CodeGenie doesn't let us keep the diagnostic information around at this point. So instead we must
        // rerun the scan instead to get the diagnostic restored.
        await document.save(); // TODO: This whole space will be refactored soon so that we don't need to do a save and rerun.
        if (!settingsManager.getAnalyzeOnSave()) {
            return codeAnalyzerRunner.runAndDisplay(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [document.fileName]);
        }
    });


    // =================================================================================================================
    // ==  Finalize activation
    // =================================================================================================================

    if(settingsManager.getCodeAnalyzerUseV4Deprecated()) {
        const button1Text: string = "Start using v5";
        const button2Text: string = "Show settings";
        vscode.window.showWarningMessage(messages.stoppingV4SupportSoon, button1Text, button2Text).then(selection => {
            if (selection === button1Text) {
                settingsManager.setCodeAnalyzerUseV4Deprecated(false);
            } else if (selection === button2Text) {
                const settingUri = vscode.Uri.parse('vscode://settings/codeAnalyzer.Use v4 (Deprecated)');
                vscode.commands.executeCommand('vscode.open', settingUri);
            }
        });
    }

    telemetryService.sendExtensionActivationEvent(extensionHrStart);
    logger.log('Extension sfdx-code-analyzer-vscode activated.');
    return {
        logger: logger,
        settingsManager: settingsManager,
        diagnosticManager: diagnosticManager,
        context: context
    };
}

// This method is called when your extension is deactivated
export function deactivate(): void {
}

// TODO: We either need to give the user control over which files the auto-scan on open/save feature works for...
//       ... or we need to somehow determine dynamically if the file is relevant for scanning using the
//       ... --workspace option on Code Analyzer v5 or something. I think that regex has situations that work on all
//       ....files. So We might not be able to get this perfect. Need to discuss this soon.
export function _isValidFileForAnalysis(documentUri: vscode.Uri): boolean {
    const allowedFileTypes:string[] = ['.cls', '.js', '.apex', '.trigger', '.ts', '.xml'];
    return allowedFileTypes.includes(path.extname(documentUri.fsPath));
}

// Inside our package.json you'll see things like:
//     "when": "sfca.partialRunsEnabled && sfca.codeAnalyzerV4Enabled"
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
