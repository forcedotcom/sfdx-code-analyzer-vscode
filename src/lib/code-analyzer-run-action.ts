import {Logger} from "./logger";
import {CodeAnalyzerDiagnostic, DiagnosticManager, Violation} from "./diagnostics";
import * as vscode from "vscode";
import {messages} from "./messages";
import {TelemetryService} from "./external-services/telemetry-service";
import * as Constants from './constants';
import {CodeAnalyzer} from "./code-analyzer";
import {Display} from "./display";
import {getErrorMessage, getErrorMessageWithStack} from "./utils";
import {ProgressReporter, TaskWithProgressRunner} from "./progress";

export const UNINSTANTIABLE_ENGINE_RULE = 'UninstantiableEngineError';

export class CodeAnalyzerRunAction {
    private readonly taskWithProgressRunner: TaskWithProgressRunner;
    private readonly codeAnalyzer: CodeAnalyzer;
    private readonly diagnosticManager: DiagnosticManager;
    private readonly telemetryService: TelemetryService;
    private readonly logger: Logger;
    private readonly display: Display;
    private seenErrors: Map<string, boolean> = new Map();

    constructor(taskWithProgressRunner: TaskWithProgressRunner, codeAnalyzer: CodeAnalyzer, diagnosticManager: DiagnosticManager, telemetryService: TelemetryService, logger: Logger, display: Display) {
        this.taskWithProgressRunner = taskWithProgressRunner;
        this.codeAnalyzer = codeAnalyzer;
        this.diagnosticManager = diagnosticManager;
        this.telemetryService = telemetryService;
        this.logger = logger;
        this.display = display;
    }

    /**
     * Runs the scanner against the specified file and displays the results.
     * @param commandName The command being run
     * @param filesToScan The files to run against
     */
    run(commandName: string, filesToScan: string[]): Promise<void> {
        return this.taskWithProgressRunner.runTask(async (progressReporter: ProgressReporter) => {
            const startTime: number = Date.now();

            try {
                progressReporter.reportProgress({
                    message: messages.scanProgressReport.verifyingCodeAnalyzerIsInstalled,
                    increment: 5
                });
                await this.codeAnalyzer.validateEnvironment();

                progressReporter.reportProgress({
                    message: messages.scanProgressReport.identifyingTargets,
                    increment: 10
                });
                // TODO: We need to move the target identification code in here instead of having it outside of this action

                progressReporter.reportProgress({
                    message: messages.scanProgressReport.analyzingTargets,
                    increment: 20
                });
                this.logger.log(messages.info.scanningWith(await this.codeAnalyzer.getScannerName()));
                const violations: Violation[] = await this.codeAnalyzer.scan(filesToScan);

                progressReporter.reportProgress({
                    message: messages.scanProgressReport.processingResults,
                    increment: 60
                });

                // Display violations that have no file location and keep the violations that do have a location.
                const violationsWithFileLocation: Violation[] = violations.filter((violation: Violation) => {
                    const hasFileLocation: boolean = violation.locations.length > 0 &&
                        violation.locations[violation.primaryLocationIndex].file !== undefined;
                    if (!hasFileLocation) {
                        this.displayViolationThatHasNoFileLocation(violation);
                        return false;
                    }
                    return true;
                });

                const diagnostics: CodeAnalyzerDiagnostic[] = violationsWithFileLocation.map(v => CodeAnalyzerDiagnostic.fromViolation(v));
                this.diagnosticManager.clearDiagnosticsForFiles(filesToScan.map(f => vscode.Uri.file(f)));
                this.diagnosticManager.addDiagnostics(diagnostics);
                void this.displayResults(filesToScan.length, violationsWithFileLocation);

                this.telemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_STATIC_ANALYSIS, {
                    commandName: commandName,
                    duration: (Date.now() - startTime).toString()
                });
            } catch (err) {
                this.display.displayError(messages.error.analysisFailedGenerator(getErrorMessage(err)));
                this.telemetryService.sendException(Constants.TELEM_FAILED_STATIC_ANALYSIS,
                    getErrorMessageWithStack(err),
                    {
                        executedCommand: commandName,
                        duration: (Date.now() - startTime).toString()
                    }
                );
            }
        });
    }

    private displayViolationThatHasNoFileLocation(violation: Violation) {
        const fullMsg: string = `[${violation.engine}:${violation.rule}] ${violation.message}`;
        if (violation.rule === UNINSTANTIABLE_ENGINE_RULE) {
            this.handleEngineError(violation.engine);
        } else if (violation.severity <= 2) {
            this.display.displayError(fullMsg);
        } else if (violation.severity <= 4) {
            this.display.displayWarning(fullMsg);
        } else {
            this.display.displayInfo(fullMsg);
        }
    }

    private displayResults(numFilesScanned: number, violations: Violation[]): void {
        const filesWithViolations: Set<string> = new Set();
        for (const violation of violations) {
            filesWithViolations.add(violation.locations[violation.primaryLocationIndex].file);
        }
        this.display.displayInfo(messages.info.finishedScan(numFilesScanned, filesWithViolations.size, violations.length));
    }

    /**
     * An engine won't start, and we want to limit how many times a user has to encounter this error.
     * If the user has seen the error for this engine in this session - don't show it again.
     * If it's the first time seeing it, then store that and notify the user.
     */
    private handleEngineError(engine: string) {
        const engineWorkspaceKey = `${Constants.ENGINE_WARNING_PREFIX}${engine}`;
        const seenThisEngineError = this.seenErrors.get(engineWorkspaceKey) ?? false;

        if (!seenThisEngineError) {
            this.seenErrors.set(engineWorkspaceKey, true);
            this.display.displayError(messages.error.engineUninstantiable(engine),
            {
                text: messages.buttons.learnMore,
                callback: (): void => {
                    const settingUri: vscode.Uri = vscode.Uri.parse(Constants.DOCS_SETUP_LINK);
                    void vscode.commands.executeCommand(Constants.VSCODE_COMMAND_OPEN_URL, settingUri);
                }
            });
        }
    }
}
