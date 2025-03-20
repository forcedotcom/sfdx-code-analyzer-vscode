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
import {DiagnosticManager, DiagnosticManagerImpl} from './lib/diagnostics';
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
import {CodeActionProvider, CodeActionProviderMetadata, DocumentSelector} from "vscode";
import {AgentforceCodeActionProvider} from "./lib/agentforce/agentforce-code-action-provider";
import {UnifiedDiffActions} from "./lib/unified-diff/unified-diff-actions";
import {CodeGenieUnifiedDiffTool, UnifiedDiffTool} from "./lib/unified-diff/unified-diff-tool";
import {FixSuggestion} from "./lib/fix-suggestion";


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
    const registerCodeActionsProvider = (selector: DocumentSelector, provider: CodeActionProvider, metadata?: CodeActionProviderMetadata): void => {
        context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selector, provider, metadata));
    }
    const onDidSaveTextDocument = (listener: (e: unknown) => unknown): void => {
        context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(listener));
    }
    const onDidOpenTextDocument = (listener: (e: unknown) => unknown): void => {
        context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(listener));
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
    const diagnosticManager: DiagnosticManager = new DiagnosticManagerImpl(diagnosticCollection, telemetryService, logger);
    context.subscriptions.push(diagnosticManager);
    const codeAnalyzerRunner: CodeAnalyzerRunner = new CodeAnalyzerRunner(diagnosticManager, settingsManager, telemetryService, logger);

    // We need to do this first in case any other services need access to those provided by the core extension.
    // TODO: Soon we should get rid of this CoreExtensionService stuff in favor of putting things inside of the ExternalServiceProvider
    await CoreExtensionService.loadDependencies(outputChannel);


    // =================================================================================================================
    // ==  Code Analyzer Run Functionality
    // =================================================================================================================
    await establishVariableInContext('sfca.codeAnalyzerV4Enabled', () => Promise.resolve(!settingsManager.getCodeAnalyzerV5Enabled()));

    // COMMAND_RUN_ON_ACTIVE_FILE: Invokable by 'commandPalette' and 'editor/context' menu always. Uses v4 instead of v5 when 'sfca.codeAnalyzerV4Enabled'.
    registerCommand(Constants.COMMAND_RUN_ON_ACTIVE_FILE, async () => {
        if (!vscode.window.activeTextEditor) {
            throw new Error(messages.targeting.error.noFileSelected);
        }

        // Note that the active editor window could be the output window instead of the actual file editor, so we
        // force focus it first to ensure we are getting the correct editor
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        const document: vscode.TextDocument = vscode.window.activeTextEditor.document;

        return codeAnalyzerRunner.runAndDisplay(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [document.fileName]);
    });
    // ... also invoked by opening a file if the user has set things to do so.
    onDidOpenTextDocument(async (textDocument: vscode.TextDocument) => {
        if (settingsManager.getAnalyzeOnOpen() && _isValidFileForAnalysis(textDocument.uri)) {
            await codeAnalyzerRunner.runAndDisplay(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [textDocument.fileName]);
        }
    });
    // ... also invoked by saving a file if the user has set things to do so.
    onDidSaveTextDocument(async (textDocument: vscode.TextDocument) => {
        if (settingsManager.getAnalyzeOnSave() && _isValidFileForAnalysis(textDocument.uri)) {
            await codeAnalyzerRunner.runAndDisplay(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [textDocument.fileName]);
        }
    });

    // COMMAND_RUN_ON_SELECTED: Invokable by 'explorer/context' menu always. Uses v4 instead of v5 when 'sfca.codeAnalyzerV4Enabled'.
    registerCommand(Constants.COMMAND_RUN_ON_SELECTED, async (selection: vscode.Uri, multiSelect?: vscode.Uri[]) => {
        const targetUris: vscode.Uri[] = multiSelect && multiSelect.length > 0
            ? multiSelect
            : [selection];
        // TODO: We may wish to consider moving away from this target resolution, and just passing in files and folders
        //       as given to us. It's possible the current style could lead to overflowing the CLI when a folder has
        //       many files.
        const targetStrings: string[] = await targeting.getTargets(targetUris);
        return codeAnalyzerRunner.runAndDisplay(Constants.COMMAND_RUN_ON_SELECTED, targetStrings);
    });


    // =================================================================================================================
    // ==  Diagnostic Management Functionality
    // =================================================================================================================

    // TODO: We should look to see if we can make these commands appear conditionally upon whether we have diagnostics
    //       present instead of always showing them. Maybe there is a way to watch the diagnostics changing.

    // COMMAND_REMOVE_DIAGNOSTICS_ON_ACTIVE_FILE: Invokable by 'commandPalette' and 'editor/context' always
    registerCommand(Constants.COMMAND_REMOVE_DIAGNOSTICS_ON_ACTIVE_FILE, async () =>
            diagnosticManager.clearDiagnosticsForSelectedFiles([], Constants.COMMAND_REMOVE_DIAGNOSTICS_ON_ACTIVE_FILE));

    // COMMAND_REMOVE_DIAGNOSTICS_ON_SELECTED_FILE: Invokable by 'explorer/context' always
    // ... and also invoked by a Quick Fix button that appears on diagnostics. TODO: This should change because we should only be suppressing diagnostics of a specific type - not all of them.
    registerCommand(Constants.COMMAND_REMOVE_DIAGNOSTICS_ON_SELECTED_FILE, async (selection: vscode.Uri, multiSelect?: vscode.Uri[]) =>
            diagnosticManager.clearDiagnosticsForSelectedFiles(multiSelect && multiSelect.length > 0 ? multiSelect : [selection],
            Constants.COMMAND_REMOVE_DIAGNOSTICS_ON_SELECTED_FILE));


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
        const targets: string[] = await targeting.getTargets([]);
        return await ApexGuruFunctions.runApexGuruOnFile(vscode.Uri.file(targets[0]),
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
    registerCommand(Constants.QF_COMMAND_A4D_FIX, async (document: vscode.TextDocument, diagnostic: vscode.Diagnostic) => {
        const fixSuggestion: FixSuggestion = await agentforceViolationFixer.suggestFix(document, diagnostic);
        if (!fixSuggestion) {
            return;
        }

        logger.debug(`Agentforce Fix Diff:\n` + 
            `=== ORIGINAL CODE ===:\n${fixSuggestion.getOriginalCodeToBeFixed()}\n\n` +
            `=== FIXED CODE ===:\n${fixSuggestion.getFixedCode()}`);

        diagnosticManager.clearDiagnostic(document.uri, diagnostic);

        // TODO: We really need to either improve or replace the CodeGenie unified diff tool. Ideally, we would be
        //  passing the fixSuggestion to some sort of callback that when the diff is rejected, restore the diagnostic
        //  that we just removed that is associated with the fix but the CodeGenie diff tool doesn't allow us to do that.

        // Display the diff with buttons that call through to the commands:
        //    CODEGENIE_UNIFIED_DIFF_ACCEPT, CODEGENIE_UNIFIED_DIFF_REJECT, CODEGENIE_UNIFIED_DIFF_ACCEPT_ALL, CODEGENIE_UNIFIED_DIFF_REJECT_ALL
        const commandSource: string = Constants.QF_COMMAND_A4D_FIX;
        await unifiedDiffActions.createDiff(commandSource, document, fixSuggestion.getFixedDocumentCode());

        if (fixSuggestion.hasExplanation()) {
            vscode.window.showInformationMessage(messages.agentforce.explanationOfFix(fixSuggestion.getExplanation()));
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
        const document: vscode.TextDocument = vscode.window.activeTextEditor.document;

        await unifiedDiffActions.acceptDiffHunk(commandSource, document, diffHunk);
    });

    // Invoked by the "Reject" button on the CodeGenie Unified Diff tool
    registerCommand(CODEGENIE_UNIFIED_DIFF_REJECT, async (diffHunk: DiffHunk) => {
        // Unfortunately the CodeGenie diff tool doesn't pass in the original source of the diff, so we hardcode
        // this for now since A4D is the only source for the unified diff so far.
        const commandSource: string = `${Constants.QF_COMMAND_A4D_FIX}>${CODEGENIE_UNIFIED_DIFF_REJECT}`;
        // Also, CodeGenie diff tool does not pass in the document, and so we assume it is the active one since the user clicked the button.
        const document: vscode.TextDocument = vscode.window.activeTextEditor.document;
        await unifiedDiffActions.rejectDiffHunk(commandSource, document, diffHunk);

        // Work Around: For reject & reject all, we really should be restoring the diagnostic that we removed
        // but CodeGenie doesn't let us keep the diagnostic information around at this point. So instead we must
        // rerun the scan instead to get the diagnostic restored.
        await document.save(); // TODO: saving the document should be built in to the runAndDisplay command in my opinion
        return codeAnalyzerRunner.runAndDisplay(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [document.fileName]);
    });

    // Invoked by the "Accept All" button on the CodeGenie Unified Diff tool
    registerCommand(CODEGENIE_UNIFIED_DIFF_ACCEPT_ALL, async () => {
        // Unfortunately the CodeGenie diff tool doesn't pass in the original source of the diff, so we hardcode
        // this for now since A4D is the only source for the unified diff so far.
        const commandSource: string = `${Constants.QF_COMMAND_A4D_FIX}>${CODEGENIE_UNIFIED_DIFF_ACCEPT_ALL}`;
        // Also, CodeGenie diff tool does not pass in the document, and so we assume it is the active one since the user clicked the button.
        const document: vscode.TextDocument = vscode.window.activeTextEditor.document;

        await unifiedDiffActions.acceptAll(commandSource, document);
    });

    // Invoked by the "Reject All" button on the CodeGenie Unified Diff tool
    registerCommand(CODEGENIE_UNIFIED_DIFF_REJECT_ALL, async () => {
        // Unfortunately the CodeGenie diff tool doesn't pass in the original source of the diff, so we hardcode
        // this for now since A4D is the only source for the unified diff so far.
        const commandSource: string = `${Constants.QF_COMMAND_A4D_FIX}>${CODEGENIE_UNIFIED_DIFF_REJECT_ALL}`;
        // Also, CodeGenie diff tool does not pass in the document, and so we assume it is the active one since the user clicked the button.
        const document: vscode.TextDocument = vscode.window.activeTextEditor.document;
        await unifiedDiffActions.rejectAll(commandSource, document);

        // Work Around: For reject & reject all, we really should be restoring the diagnostic that we removed
        // but CodeGenie doesn't let us keep the diagnostic information around at this point. So instead we must
        // rerun the scan instead to get the diagnostic restored.
        await document.save(); // TODO: saving the document should be built in to the runAndDisplay command in my opinion
        return codeAnalyzerRunner.runAndDisplay(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [document.fileName]);
    });


    // =================================================================================================================
    // ==  Finalize activation
    // =================================================================================================================
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
    const allowedFileTypes:string[] = ['.cls', '.js', '.apex', '.trigger', '.ts'];
    return allowedFileTypes.includes(path.extname(documentUri.path));
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