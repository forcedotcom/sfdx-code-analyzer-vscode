import {ScannerStrategy} from '../scanner-strategies/scanner-strategy';
import {Display} from '../display';
import * as Constants from '../constants';
import {CodeAnalyzerDiagnostic, DiagnosticManager, Violation} from '../diagnostics';
import {messages} from '../messages';
import {TelemetryService} from "../external-services/telemetry-service";
import * as vscode from "vscode";
import {Logger} from "../logger";

export class ScannerAction {
    private readonly commandName: string;
    private readonly scannerStrategy: ScannerStrategy;
    private readonly diagnosticManager: DiagnosticManager;
    private readonly telemetryService: TelemetryService;
    private readonly logger: Logger;
    private readonly display: Display;

    public constructor(commandName: string, scannerStrategy: ScannerStrategy, diagnosticManager: DiagnosticManager,
                       telemetryService: TelemetryService, logger: Logger, display: Display) {
        this.commandName = commandName;
        this.scannerStrategy = scannerStrategy;
        this.diagnosticManager = diagnosticManager;
        this.telemetryService = telemetryService;
        this.logger = logger;
        this.display = display;
    }

    public async runScanner(filesToScan: string[]): Promise<void> {
        const startTime = Date.now();
        await this.scannerStrategy.validateEnvironment();

        this.display.displayProgress(messages.scanProgressReport.identifyingTargets);

        this.display.displayProgress(messages.scanProgressReport.analyzingTargets);

        this.logger.log(messages.info.scanningWith(this.scannerStrategy.getScannerName()));

        const violations: Violation[] = await this.scannerStrategy.scan(filesToScan);

        this.display.displayProgress(messages.scanProgressReport.processingResults);

        // Display violations have no file location and keep the violations that do have a location.
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

        this.telemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_STATIC_ANALYSIS, {
            commandName: this.commandName,
            duration: (Date.now() - startTime).toString()
        });

        void this.displayResults(filesToScan.length, violationsWithFileLocation);
    }

    private displayViolationThatHasNoFileLocation(violation: Violation) {
        const fullMsg: string = `[${violation.engine}:${violation.rule}] ${violation.message}`;
        if (violation.severity <= 2) {
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
}
