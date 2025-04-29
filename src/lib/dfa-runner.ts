import * as vscode from "vscode";
import {TelemetryService} from "./external-services/telemetry-service";
import {Logger} from "./logger";
import * as Constants from "./constants";
import {messages} from "./messages";
import * as DeltaRunFunctions from "./deltarun/delta-run-service";
import fs from "fs";
import path from "path";
import * as targeting from "./targeting";
import os from "os";
import {ScanRunner} from "./scanner";
import {SIGKILL} from "constants";
import {CodeAnalyzer} from "./code-analyzer";
import {CliCommandExecutorImpl} from "./cli-commands";
import {SettingsManagerImpl} from "./settings";

export class DfaRunner implements vscode.Disposable {
    private readonly sfgeCachePath: string = path.join(createTempDirectory(), 'sfca-graph-engine-cache.json');
    private readonly savedFilesCache: Set<string> = new Set();

    private readonly context: vscode.ExtensionContext;
    private readonly codeAnalyzer: CodeAnalyzer;
    private readonly telemetryService: TelemetryService;
    private readonly logger: Logger;

    constructor(context: vscode.ExtensionContext, codeAnalyzer: CodeAnalyzer, telemetryService: TelemetryService, logger: Logger) {
        this.context = context;
        this.codeAnalyzer = codeAnalyzer;
        this.telemetryService = telemetryService;
        this.logger = logger;
    }

    dispose(): void {
        this.clearSavedFilesCache();

        // TODO: We should consider maybe making the sfgeCachePath's parent temp directory creation JIT and async and
        // then have a way of deleting the directory and all of its contents here during dispose().
    }

    clearSavedFilesCache() {
        this.savedFilesCache.clear();
    }

    addSavedFileToCache(filePath: string) {
        this.savedFilesCache.add(filePath);
    }

    async shouldProceedWithDfaRun(): Promise<boolean> {
        if (this.context.workspaceState.get(Constants.WORKSPACE_DFA_PROCESS)) {
            void vscode.window.showInformationMessage(messages.graphEngine.existingDfaRunText);
            return false;
        }
        return Promise.resolve(true);
    }

    async runDfa(): Promise<void> {
        if (this.violationsCacheExists()) {
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
                const deltaRunTargets = DeltaRunFunctions.getDeltaRunTarget(this.sfgeCachePath, this.savedFilesCache);
                if (deltaRunTargets.length == 0) {
                    void vscode.window.showInformationMessage("Your local changes didn't change the outcome of the previous full Salesforce Graph Engine scan.");
                    return;
                }
                await this.runDfaOnSelectMethods(deltaRunTargets);
            } else {
                void vscode.window.showWarningMessage('A full Salesforce Graph Engine scan is running in the background. You can cancel it by clicking the progress bar.');
                await this.runDfaOnWorkspace();
            }
        } else {
            await this.runDfaOnWorkspace();
        }
    }

    private async runDfaOnWorkspace(): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: messages.graphEngine.spinnerText,
            cancellable: true
        }, async (_progress, token) => {
            token.onCancellationRequested(async () => await this.stopExistingDfaRun());

            const customCancellationToken: vscode.CancellationTokenSource = new vscode.CancellationTokenSource();
            customCancellationToken.token.onCancellationRequested(() =>
                void vscode.window.showInformationMessage(messages.graphEngine.noViolationsFound));

            // We only have one project loaded on VSCode at once. So, projectDir should have only one entry and we use
            // the root directory of that project as the projectDir argument to run DFA.
            return this._runAndDisplayDfa(Constants.COMMAND_RUN_DFA, customCancellationToken, null,
                targeting.getProjectDir());
        });
    }

    private async runDfaOnSelectMethods(selectedMethods: string[]) {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: messages.graphEngine.spinnerText,
            cancellable: true
        }, async (_progress, token) => {
            token.onCancellationRequested(async () => await this.stopExistingDfaRun());

            const customCancellationToken: vscode.CancellationTokenSource = new vscode.CancellationTokenSource();
            customCancellationToken.token.onCancellationRequested(() =>
                void vscode.window.showInformationMessage(messages.graphEngine.noViolationsFoundForPartialRuns));

            // We only have one project loaded on VSCode at once. So, projectDir should have only one entry and we use
            // the root directory of that project as the projectDir argument to run DFA.
            return this._runAndDisplayDfa(Constants.COMMAND_RUN_DFA, customCancellationToken,
                selectedMethods, targeting.getProjectDir());
        });
    }

    async runMethodLevelDfa(methodLevelTarget: string[]) {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: messages.graphEngine.spinnerText,
            cancellable: true
        }, async (_progress, token) => {
            token.onCancellationRequested(async () => await this.stopExistingDfaRun());

            const customCancellationToken: vscode.CancellationTokenSource = new vscode.CancellationTokenSource();
            customCancellationToken.token.onCancellationRequested(() =>
                void vscode.window.showInformationMessage(messages.graphEngine.noViolationsFound));

            // Pull out the file from the target and use it to identify the project directory.
            const currentFile: string = methodLevelTarget[0].substring(0, methodLevelTarget.lastIndexOf('#'));
            const projectDir: string = targeting.getProjectDir(currentFile);

            return this._runAndDisplayDfa(Constants.COMMAND_RUN_DFA_ON_SELECTED_METHOD, customCancellationToken,
                methodLevelTarget, projectDir);
        });
    }

    // public for testing purposes only
    async _runAndDisplayDfa(commandName: string, cancelToken: vscode.CancellationTokenSource, methodLevelTarget: string[],
                           projectDir: string): Promise<void> {
        const startTime = Date.now();
        try {
            await this.codeAnalyzer.validateEnvironment(); // Since the ScanRunner currently doesn't take in the codeAnalyzer to run dfa commands, we just validate here
            const scanRunner: ScanRunner = new ScanRunner(new SettingsManagerImpl(), new CliCommandExecutorImpl(this.logger));
            const results = await scanRunner.runDfa(methodLevelTarget, projectDir, this.context, this.sfgeCachePath);
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
            this.telemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_DFA_ANALYSIS, {
                executedCommand: commandName,
                duration: (Date.now() - startTime).toString()
            });
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : e as string;
            this.telemetryService.sendException(Constants.TELEM_FAILED_DFA_ANALYSIS, errMsg, {
                executedCommand: commandName,
                duration: (Date.now() - startTime).toString()
            });
            // This has to be a floating promise, since the command won't complete until
            // the error is dismissed.
            vscode.window.showErrorMessage(messages.error.analysisFailedGenerator(errMsg));
            this.logger.error(errMsg);
        }
    }

    async stopExistingDfaRun(): Promise<void> {
        const pid = this.context.workspaceState.get(Constants.WORKSPACE_DFA_PROCESS);
        if (pid) {
            try {
                process.kill(pid as number, SIGKILL);
                void this.context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);
                void vscode.window.showInformationMessage(messages.graphEngine.dfaRunStopped);
            } catch (e) {
                // Exception is thrown by process.kill if between the time the pid exists and kill is executed, the process
                // ends by itself. Ideally it should clear the cache, but doing this as an abundant of caution.
                void this.context.workspaceState.update(Constants.WORKSPACE_DFA_PROCESS, undefined);
                const errMsg = e instanceof Error ? e.message : e as string;
                this.logger.error(`Failed killing DFA process.\n${errMsg}`);
            }
        } else {
            void vscode.window.showInformationMessage(messages.graphEngine.noDfaRun);
        }
        return Promise.resolve();
    }

    private violationsCacheExists(): boolean {
        return fs.existsSync(this.sfgeCachePath);
    }
}

function createTempDirectory(): string {
    const tempFolderPrefix = path.join(os.tmpdir(), Constants.EXTENSION_PACK_ID);
    try {
        return fs.mkdtempSync(tempFolderPrefix);
    } catch (err) {
        const errMsg: string = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to create temporary directory:\n${errMsg}`);
    }
}
