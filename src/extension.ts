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
import {DiffCreateAction} from './lib/actions/diff-create-action';
import {DiffAcceptAction} from './lib/actions/diff-accept-action';
import {DiffRejectAction} from './lib/actions/diff-reject-action';
import {messages} from './lib/messages';
import {Fixer} from './lib/fixer';
import {CoreExtensionService} from './lib/core-extension-service';
import * as Constants from './lib/constants';
import * as path from 'path';
import * as ApexGuruFunctions from './lib/apexguru/apex-guru-service';
import {AgentforceViolationsFixer} from './lib/agentforce/agentforce-violations-fixer'
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
    registerCommand(Constants.COMMAND_RUN_ON_ACTIVE_FILE, async () => {
        if (!vscode.window.activeTextEditor) {
            throw new Error(messages.targeting.error.noFileSelected);
        }
        return codeAnalyzerRunner.runAndDisplay(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [vscode.window.activeTextEditor.document.fileName]);
    });

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

    onDidSaveTextDocument(async (textDocument: vscode.TextDocument) => {
        if (settingsManager.getAnalyzeOnSave()) {
            await codeAnalyzerRunner.runAndDisplay(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [textDocument.fileName]);
        }
    });

    onDidOpenTextDocument(async (textDocument: vscode.TextDocument) => {
        if (settingsManager.getAnalyzeOnOpen()) {
            if (_isValidFileForAnalysis(textDocument.uri)) {
                await codeAnalyzerRunner.runAndDisplay(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [textDocument.fileName]);
            }
        }
    });


    // =================================================================================================================
    // ==  Diagnostic Management Functionality
    // =================================================================================================================
    registerCommand(Constants.COMMAND_REMOVE_DIAGNOSTICS_ON_ACTIVE_FILE, async () =>
            diagnosticManager.clearDiagnosticsForSelectedFiles([], Constants.COMMAND_REMOVE_DIAGNOSTICS_ON_ACTIVE_FILE));

    registerCommand(Constants.COMMAND_REMOVE_DIAGNOSTICS_ON_SELECTED_FILE, async (selection: vscode.Uri, multiSelect?: vscode.Uri[]) =>
            diagnosticManager.clearDiagnosticsForSelectedFiles(multiSelect && multiSelect.length > 0 ? multiSelect : [selection],
            Constants.COMMAND_REMOVE_DIAGNOSTICS_ON_SELECTED_FILE));

    registerCommand(Constants.COMMAND_DIAGNOSTICS_IN_RANGE, (uri: vscode.Uri, range: vscode.Range) =>
            diagnosticManager.clearDiagnosticsInRange(uri, range));


    // =================================================================================================================
    // ==  Code Analyzer Basic Quick-Fix Functionality
    // =================================================================================================================
    registerCodeActionsProvider({pattern: '**/**'}, new Fixer(),
        {providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]});


    // =================================================================================================================
    // ==  DFA Run Functionality
    // =================================================================================================================

    // It is possible that the cache was not cleared when VS Code exited the last time. Just to be on the safe side, we clear the DFA process cache at activation.
    void context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);
    await establishVariableInContext('sfca.partialRunsEnabled', () => Promise.resolve(settingsManager.getSfgePartialSfgeRunsEnabled()));

    registerCommand(Constants.COMMAND_RUN_DFA_ON_SELECTED_METHOD, async () => {
        if (await dfaRunner.shouldProceedWithDfaRun()) {
            const methodLevelTarget: string[] = [await targeting.getSelectedMethod()];
            await dfaRunner.runMethodLevelDfa(methodLevelTarget);
        }
    });

    registerCommand(Constants.COMMAND_RUN_DFA, async () => {
        await dfaRunner.runDfa();
        dfaRunner.clearSavedFilesCache();
    });

    onDidSaveTextDocument((document: vscode.TextDocument) => dfaRunner.addSavedFileToCache(document.uri.fsPath));


    // =================================================================================================================
    // ==  Apex Guru Integration Functionality
    // =================================================================================================================
    const isApexGuruEnabled: () => Promise<boolean> =
        async () => settingsManager.getApexGuruEnabled() && await ApexGuruFunctions.isApexGuruEnabledInOrg(logger);
    await establishVariableInContext('sfca.apexGuruEnabled', isApexGuruEnabled);

    // TODO: When someone enables apex guru then they need to restart VS Code... we should register these commands and
    //       make them appear conditioned based on the 'sfca.apexGuruEnabled' context instead of registering these
    //       commands in a conditional inside of the activate function.
    if (await isApexGuruEnabled()) {
        registerCommand(Constants.COMMAND_RUN_APEX_GURU_ON_FILE, async (selection: vscode.Uri, multiSelect?: vscode.Uri[]) =>
            await ApexGuruFunctions.runApexGuruOnFile(multiSelect && multiSelect.length > 0 ? multiSelect[0] : selection,
                Constants.COMMAND_RUN_APEX_GURU_ON_FILE, diagnosticManager, telemetryService, logger));

        registerCommand(Constants.COMMAND_RUN_APEX_GURU_ON_ACTIVE_FILE, async () => {
            const targets: string[] = await targeting.getTargets([]);
            return await ApexGuruFunctions.runApexGuruOnFile(vscode.Uri.file(targets[0]),
                Constants.COMMAND_RUN_APEX_GURU_ON_ACTIVE_FILE, diagnosticManager, telemetryService, logger);
        });

        registerCommand(Constants.COMMAND_INCLUDE_APEX_GURU_SUGGESTIONS, async (document: vscode.TextDocument, position: vscode.Position, suggestedCode: string) => {
            const edit = new vscode.WorkspaceEdit();
            edit.insert(document.uri, position, suggestedCode);
            await vscode.workspace.applyEdit(edit);
            telemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_APEX_GURU_FILE_ANALYSIS, {
                executedCommand: Constants.COMMAND_INCLUDE_APEX_GURU_SUGGESTIONS,
                lines: suggestedCode.split('\n').length.toString()
            });
        });
    }


    // =================================================================================================================
    // ==  Agentforce for Developers Integration and Unified Diff Functionality
    // =================================================================================================================
    if (Constants.ENABLE_A4D_INTEGRATION && await externalServiceProvider.isLLMServiceAvailable()) {
        const agentforceViolationsFixer = new AgentforceViolationsFixer(await externalServiceProvider.getLLMService());
        registerCodeActionsProvider({pattern: '**/*.cls'}, agentforceViolationsFixer,
                {providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]});

        registerCommand(Constants.UNIFIED_DIFF, async (source: string, code: string, file?: string) => {
            await (new DiffCreateAction(`${source}.${Constants.UNIFIED_DIFF}`, {
                callback: (code: string, file?: string) => VSCodeUnifiedDiff.singleton.unifiedDiff(code, file),
                telemetryService
            })).run(code, file);
            await VSCodeUnifiedDiff.singleton.unifiedDiff(code, file);
        });

        registerCommand(CODEGENIE_UNIFIED_DIFF_ACCEPT, async (hunk: DiffHunk) => {
            // TODO: The use of the prefix shouldn't be hardcoded. Ideally, it should be passed in as an argument to the command.
            //       But that would require us to make changes to the underlying UnifiedDiff code that we're not currently in a position to make.
            await (new DiffAcceptAction(`${Constants.A4D_PREFIX}.${CODEGENIE_UNIFIED_DIFF_ACCEPT}`, {
                callback: async (diffHunk: DiffHunk) => {
                    await VSCodeUnifiedDiff.singleton.unifiedDiffAccept(diffHunk);
                    return diffHunk.lines.length;
                },
                telemetryService
            })).run(hunk);
            // For accept & accept all, it is tricky to track the diagnostics and the changed lines as multiple fixes are requested.
            // Hence, we save the file and rerun the scan instead.
            await vscode.window.activeTextEditor.document.save();
            return codeAnalyzerRunner.runAndDisplay(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [vscode.window.activeTextEditor.document.fileName]);
        });

        registerCommand(CODEGENIE_UNIFIED_DIFF_REJECT, async (hunk: DiffHunk) => {
            // TODO: The use of the prefix shouldn't be hardcoded. Ideally, it should be passed in as an argument to the command.
            //       But that would require us to make changes to the underlying UnifiedDiff code that we're not currently in a position to make.
            await (new DiffRejectAction(`${Constants.A4D_PREFIX}.${CODEGENIE_UNIFIED_DIFF_REJECT}`, {
                callback: (diffHunk: DiffHunk) => VSCodeUnifiedDiff.singleton.unifiedDiffReject(diffHunk),
                telemetryService
            })).run(hunk);
        });

        registerCommand(CODEGENIE_UNIFIED_DIFF_ACCEPT_ALL, async () => {
            // TODO: The use of the prefix shouldn't be hardcoded. Ideally, it should be passed in as an argument to the command.
            //       But that would require us to make changes to the underlying UnifiedDiff code that we're not currently in a position to make.
            await (new DiffAcceptAction(`${Constants.A4D_PREFIX}.${CODEGENIE_UNIFIED_DIFF_ACCEPT_ALL}`, {
                callback: () => VSCodeUnifiedDiff.singleton.unifiedDiffAcceptAll(),
                telemetryService
            })).run();
            await vscode.window.activeTextEditor.document.save();
            return codeAnalyzerRunner.runAndDisplay(Constants.COMMAND_RUN_ON_ACTIVE_FILE, [vscode.window.activeTextEditor.document.fileName]);
        });

        registerCommand(CODEGENIE_UNIFIED_DIFF_REJECT_ALL, async () => {
            // TODO: The use of the prefix shouldn't be hardcoded. Ideally, it should be passed in as an argument to the command.
            //       But that would require us to make changes to the underlying UnifiedDiff code that we're not currently in a position to make.
            await (new DiffRejectAction(`${Constants.A4D_PREFIX}.${CODEGENIE_UNIFIED_DIFF_REJECT_ALL}`, {
                callback: () => VSCodeUnifiedDiff.singleton.unifiedDiffRejectAll(),
                telemetryService
            })).run();
        });

        VSCodeUnifiedDiff.singleton.activate(context);
    }


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
