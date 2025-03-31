
import {Display, ProgressEvent, VSCodeDisplay} from "./display";
import {Logger} from "./logger";
import {DiagnosticManager} from "./diagnostics";
import * as vscode from "vscode";
import {messages} from "./messages";
import {TelemetryService} from "./external-services/telemetry-service";
import {SettingsManager} from "./settings";
import {CliScannerV5Strategy} from "./scanner-strategies/v5-scanner";
import {CliScannerV4Strategy} from "./scanner-strategies/v4-scanner";
import {ScannerAction} from "./actions/scanner-action";
import * as Constants from './constants';

// TODO: We should bring clarity about the difference between this class and the ScannerAction class.
//       My hunch is that they probably could be the same class and consolidating them would simplify things
//       since they both seem to be doing logging and telemetry stuff.
//       This class might just become a Factory of the other making its single responsibility to construct dependencies
//       like the ScannerStrategy and Display. But we'll have to think through it a little more since progress is in the
//       mix as well.
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
     * @param filesToScan The files to run against
     */
    async runAndDisplay(commandName: string, filesToScan: string[]): Promise<void> {
        const startTime = Date.now();
        try {
            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification
            }, async (progress: vscode.Progress<ProgressEvent>) => {
                const display: Display = new VSCodeDisplay(this.logger, progress);

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
                const scannerAction = new ScannerAction(commandName, scannerStrategy, this.diagnosticManager,
                    this.telemetryService, this.logger, display);
                await scannerAction.runScanner(filesToScan);
            });
        } catch (e) {
            const errMsg = e instanceof Error ? e.stack : e as string;
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
