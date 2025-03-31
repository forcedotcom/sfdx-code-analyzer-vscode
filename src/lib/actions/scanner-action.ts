import {ScannerStrategy} from '../scanner-strategies/scanner-strategy';
import {Display} from '../display';
import * as Constants from '../constants';
import {CodeAnalyzerDiagnostic, DiagnosticManager, Violation} from '../diagnostics';
import {messages} from '../messages';
import {TelemetryService} from "../external-services/telemetry-service";
import * as vscode from "vscode";

export type ScannerDependencies = {
    scannerStrategy: ScannerStrategy;
    display: Display;
    diagnosticManager: DiagnosticManager;
    telemetryService: TelemetryService;
};

export class ScannerAction {
    private readonly commandName: string;
    private readonly scannerStrategy: ScannerStrategy;
    private readonly display: Display;
    private readonly diagnosticManager: DiagnosticManager;
    private readonly telemetryService: TelemetryService;

    public constructor(commandName: string, dependencies: ScannerDependencies) {
        this.commandName = commandName;
        this.scannerStrategy = dependencies.scannerStrategy;
        this.display = dependencies.display;
        this.scannerStrategy = dependencies.scannerStrategy;
        this.diagnosticManager = dependencies.diagnosticManager;
        this.telemetryService = dependencies.telemetryService;
    }

    public async runScanner(filesToScan: string[]): Promise<void> {
        const startTime = Date.now();
        await this.scannerStrategy.validateEnvironment();

        this.display.displayProgress(messages.scanProgressReport.identifyingTargets);

        this.display.displayProgress(messages.scanProgressReport.analyzingTargets);

        this.display.displayLog(messages.info.scanningWith(this.scannerStrategy.getScannerName()));

        const violations: Violation[] = await this.scannerStrategy.scan(filesToScan);

        this.display.displayProgress(messages.scanProgressReport.processingResults);

        const hasLocation = (v: Violation) => v.locations.length > 0 && v.locations[v.primaryLocationIndex].file;
        const violationsWithLocation: Violation[] = violations.filter(hasLocation);

        // TODO: Figure out what we want to do with violations that are not associated with a file with W-18097380
        // const violationsWithoutLocation: Violation[] = violations.filter(v => !hasLocation(v));
        // ... For now we just skip them

        const diagnostics: CodeAnalyzerDiagnostic[] = violationsWithLocation.map(v => CodeAnalyzerDiagnostic.fromViolation(v));
        this.diagnosticManager.clearDiagnosticsForFiles(filesToScan.map(f => vscode.Uri.file(f)));
        this.diagnosticManager.addDiagnostics(diagnostics);

        this.telemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_STATIC_ANALYSIS, {
            commandName: this.commandName,
            duration: (Date.now() - startTime).toString()
        });

        // This has to be a floating promise, because progress bars won't disappear otherwise.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.display.displayResults(filesToScan, violations);
    }
}
