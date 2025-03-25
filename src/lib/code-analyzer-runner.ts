
import {Displayable, ProgressNotification, UxDisplay} from "./display";
import {Logger} from "./logger";
import {DiagnosticConvertible, DiagnosticManager} from "./diagnostics";
import * as vscode from "vscode";
import {messages} from "./messages";
import {TelemetryService} from "./external-services/telemetry-service";
import {SettingsManager} from "./settings";
import {CliScannerV5Strategy} from "./scanner-strategies/v5-scanner";
import {CliScannerV4Strategy} from "./scanner-strategies/v4-scanner";
import {ScannerAction, ScannerDependencies} from "./actions/scanner-action";
import * as Constants from './constants';

export class CodeAnalyzerRunner {
    private readonly diagnosticManager: DiagnosticManager;
    private readonly settingsManager: SettingsManager;
    private readonly telemetryService: TelemetryService;
    private readonly logger: Logger;

    constructor(diagnosticManager: DiagnosticManager, settingsManager: SettingsManager, telemetryService: TelemetryService, logger: Logger) {
        this.diagnosticManager = diagnosticManager;
        this.settingsManager = settingsManager;
        this.telemetryService = telemetryService;
        this.logger = logger;
    }

    /**
     * Runs the scanner against the specified file and displays the results.
     * @param commandName The command being run
     * @param targets The files/folders to run against
     */
    async runAndDisplay(commandName: string, targets: string[]): Promise<void> {
        const startTime = Date.now();
        try {
            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification
            }, async (progress) => {
                const display: UxDisplay = new UxDisplay(new VSCodeDisplayable((notif: ProgressNotification) => progress.report(notif), this.logger));
                const scannerStrategy = this.settingsManager.getCodeAnalyzerV5Enabled()
                    ? new CliScannerV5Strategy({
                        tags: this.settingsManager.getCodeAnalyzerTags()
                    })
                    : new CliScannerV4Strategy({
                        engines: this.settingsManager.getEnginesToRun(),
                        pmdCustomConfigFile: this.settingsManager.getPmdCustomConfigFile(),
                        rulesCategory: this.settingsManager.getRulesCategory(),
                        normalizeSeverity: this.settingsManager.getNormalizeSeverityEnabled()
                    });
                const actionDependencies: ScannerDependencies = {
                    scannerStrategy: scannerStrategy,
                    display: display,
                    diagnosticManager: this.diagnosticManager,
                    telemetryService: this.telemetryService
                };
                const scannerAction = new ScannerAction(commandName, actionDependencies);
                await scannerAction.runScanner(targets);
            });
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : e as string;
            this.telemetryService.sendException(Constants.TELEM_FAILED_STATIC_ANALYSIS, errMsg, {
                executedCommand: commandName,
                duration: (Date.now() - startTime).toString()
            });
            // This has to be a floating promise, since the command won't complete until
            // the error is dismissed.
            vscode.window.showErrorMessage(messages.error.analysisFailedGenerator(errMsg));
            this.logger.error(errMsg);
        }
    }
}

class VSCodeDisplayable implements Displayable {
    private readonly progressCallback: (notif: ProgressNotification) => void;
    private readonly logger: Logger;

    public constructor(progressCallback: (notif: ProgressNotification) => void, logger: Logger) {
        this.progressCallback = progressCallback;
        this.logger = logger;
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

    public log(msg: string): void {
        this.logger.log(msg);
    }
}
