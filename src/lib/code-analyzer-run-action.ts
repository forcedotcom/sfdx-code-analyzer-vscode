import * as vscode from "vscode";
import {Logger} from "./logger";
import {CodeAnalyzerDiagnostic, DiagnosticFactory, DiagnosticManager, normalizeViolation, Violation} from "./diagnostics";
import {messages} from "./messages";
import {TelemetryService} from "./external-services/telemetry-service";
import * as Constants from './constants';
import {CodeAnalyzer} from "./code-analyzer";
import {Display} from "./display";
import {getErrorMessage, getErrorMessageWithStack} from "./utils";
import {ProgressReporter, TaskWithProgressRunner} from "./progress";
import {WindowManager} from "./vscode-api";
import {Workspace} from "./workspace";
import { APEX_GURU_ENGINE_NAME } from "./apexguru/apex-guru-service";

export const UNINSTANTIABLE_ENGINE_RULE = 'UninstantiableEngineError';

export class CodeAnalyzerRunAction {
    private readonly taskWithProgressRunner: TaskWithProgressRunner;
    private readonly codeAnalyzer: CodeAnalyzer;
    private readonly diagnosticManager: DiagnosticManager;
    private readonly diagnosticFactory: DiagnosticFactory;
    private readonly telemetryService: TelemetryService;
    private readonly logger: Logger;
    private readonly display: Display;
    private readonly windowManager: WindowManager;
    private suppressedErrors: Set<string> = new Set();

    constructor(taskWithProgressRunner: TaskWithProgressRunner, codeAnalyzer: CodeAnalyzer, diagnosticManager: DiagnosticManager, diagnosticFactory: DiagnosticFactory, telemetryService: TelemetryService, logger: Logger, display: Display, windowManager: WindowManager) {
        this.taskWithProgressRunner = taskWithProgressRunner;
        this.codeAnalyzer = codeAnalyzer;
        this.diagnosticManager = diagnosticManager;
        this.diagnosticFactory = diagnosticFactory;
        this.telemetryService = telemetryService;
        this.logger = logger;
        this.display = display;
        this.windowManager = windowManager;
    }

    /**
     * Runs the scanner against the specified file and displays the results.
     * @param commandName The command being run
     * @param workspace The workspace to run against
     */
    run(commandName: string, workspace: Workspace): Promise<void> {
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
                this.logger.log(messages.info.scanningWith(await this.codeAnalyzer.getVersion()));
                const violations: Violation[] = await this.codeAnalyzer.scan(workspace);

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

                // Ideally we should be passing in the line lengths array for the primary locations for each violation
                // in our call to normalizeViolation, so that it can set the endColumn when it is missing instead of
                // setting it to MAX_SAFE_INTEGER, but it might be rather expensive to read and process all files
                // in a scan to get the line numbers. So I'm not sure if it is worth it to do this right now unless
                // a user complains. Without doing this, any diagnostics that are from locations without an endColumn
                // will be given MAX_SAFE_INTEGER which makes them unable to be deleted by the user via edits. Even if
                // the user highlights and deletes the diagnostic, they'll might see a 0 character blue line stale
                // diagnostic still be visible in some cases (because the new diag range still has a range that extends
                // past the length of the line in the editor window).
                const diagnostics: CodeAnalyzerDiagnostic[] = violationsWithFileLocation
                    .map(v => normalizeViolation(v)) // <-- Maybe in the future we'll pass in the lineLengths for the primary file
                    .map(v => this.diagnosticFactory.fromViolation(v))
                    .filter((d): d is CodeAnalyzerDiagnostic => d !== null);
                const targetedFiles: string[] = await workspace.getTargetedFiles();

                // Before adding in the new code analyzer diagnostics, we clear all the old code analyzer diagnostics
                // except for ApexGuru based diagnostics which are handled separately.
                for (const file of targetedFiles) {
                    const diagsToClear: CodeAnalyzerDiagnostic[] =
                        this.diagnosticManager.getDiagnosticsForFile(vscode.Uri.file(file))
                        .filter(d => d.violation.engine !== APEX_GURU_ENGINE_NAME);
                    this.diagnosticManager.clearDiagnostics(diagsToClear);
                }

                this.diagnosticManager.addDiagnostics(diagnostics);
                void this.displayResults(targetedFiles.length, violationsWithFileLocation);

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
            this.handleEngineSetupError(violation.engine, violation.message);
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
     * An engine won't start, and we want to limit help the user with next steps.
     * If the user has seen the error for this engine in this session and have suppressed this error, then ignore it.
     * Otherwise, provide options for the user.
     */
    private handleEngineSetupError(engineName: string, setupErrorMsg: string) {
        if (this.suppressedErrors.has(setupErrorMsg)) {
            return;
        }

        this.display.displayError(messages.error.engineUninstantiable(engineName),
            {
                text: messages.buttons.showError,
                callback: (): void => {
                    // We always log the error, so this callback is just to open the output window to show that error
                    this.windowManager.showLogOutputWindow();
                }
            },
            {
                text: messages.buttons.ignoreError,
                callback: (): void => {
                    this.suppressedErrors.add(setupErrorMsg);
                }
            },
            {
                text: messages.buttons.learnMore,
                callback: (): void => {
                    this.windowManager.showExternalUrl(Constants.DOCS_SETUP_LINK);
                }
            }
        );

        this.logger.error(setupErrorMsg + '\n\n' + messages.buttons.learnMore + ': ' + Constants.DOCS_SETUP_LINK);
    }
}
