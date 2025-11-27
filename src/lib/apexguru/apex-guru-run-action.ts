import * as vscode from "vscode";
import * as Constants from "../constants"
import { ProgressReporter, TaskWithProgressRunner } from "../progress";
import { CodeAnalyzerDiagnostic, DiagnosticManager, Violation } from "../diagnostics";
import { TelemetryService } from "../external-services/telemetry-service";
import { Display } from "../display";
import { messages } from "../messages";
import { getErrorMessage, getErrorMessageWithStack } from "../utils";
import { APEX_GURU_ENGINE_NAME, ApexGuruAccess, ApexGuruAvailability, ApexGuruService } from "./apex-guru-service";

export class ApexGuruRunAction {
    private readonly taskWithProgressRunner: TaskWithProgressRunner;
    private readonly apexGuruService: ApexGuruService;
    private readonly diagnosticManager: DiagnosticManager;
    private readonly telemetryService: TelemetryService;
    private readonly display: Display;

    constructor(taskWithProgressRunner: TaskWithProgressRunner, apexGuruService: ApexGuruService, diagnosticManager: DiagnosticManager, telemetryService: TelemetryService, display: Display) {
        this.taskWithProgressRunner = taskWithProgressRunner;
        this.apexGuruService = apexGuruService;
        this.diagnosticManager = diagnosticManager;
        this.telemetryService = telemetryService;
        this.display = display;
    }

    /**
     * Runs apex guru analysis against the specified file and displays the results.
     * @param commandName The command being run
     * @param fileUri The file to analyze
     */
    run(commandName: string, fileUri: vscode.Uri): Promise<void> {
        return this.taskWithProgressRunner.runTask(async (progressReporter: ProgressReporter) => {
            const startTime: number = Date.now();

            try {
                const availability: ApexGuruAvailability = this.apexGuruService.getAvailability();
                if (availability.access !== ApexGuruAccess.ENABLED) {
                    this.display.displayError(availability.message);
                    this.telemetryService.sendCommandEvent(Constants.TELEM_APEX_GURU_FILE_ANALYSIS_NOT_ENABLED, {
                        executedCommand: commandName,
                        access: availability.access
                    });
                    return;
                }

                progressReporter.reportProgress({
                    message: messages.apexGuru.runningAnalysis
                });

                const violations: Violation[] = await this.apexGuruService.scan(fileUri.fsPath);

                progressReporter.reportProgress({
                    message: messages.scanProgressReport.processingResults,
                    increment: 90
                });

                const diagnostics: CodeAnalyzerDiagnostic[] = violations.map(v => CodeAnalyzerDiagnostic.fromViolation(v));

                const oldApexGuruDiagnostics: CodeAnalyzerDiagnostic[] = this.diagnosticManager.getDiagnosticsForFile(fileUri)
                    .filter(d => d.violation.engine === APEX_GURU_ENGINE_NAME);
                this.diagnosticManager.clearDiagnostics(oldApexGuruDiagnostics);
                this.diagnosticManager.addDiagnostics(diagnostics);
                this.display.displayInfo(messages.apexGuru.finishedScan(diagnostics.length));

                this.telemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_APEX_GURU_FILE_ANALYSIS, {
                    executedCommand: commandName,
                    duration: (Date.now() - startTime).toString(),
                    numViolations: violations.length.toString(),
                    numViolationsWithSuggestions: violations.filter(v => v.suggestions?.length > 0).length.toString(),
                    numViolationsWithFixes: violations.filter(v => v.fixes?.length > 0).length.toString()
                });
            } catch (err) {
                this.display.displayError(messages.error.analysisFailedGenerator(getErrorMessage(err)));
                this.telemetryService.sendException(Constants.TELEM_FAILED_APEX_GURU_FILE_ANALYSIS,
                    getErrorMessageWithStack(err),
                    {
                        executedCommand: commandName,
                        duration: (Date.now() - startTime).toString()
                    }
                );
            }
        });
    }
}