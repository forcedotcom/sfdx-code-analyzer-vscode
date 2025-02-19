import {ScannerStrategy} from '../scanner-strategies/scanner-strategy';
import {Display} from '../display';
import * as Constants from '../constants';
import {TelemetryService} from '../core-extension-service';
import {DiagnosticManager, DiagnosticConvertible} from '../diagnostics';
import {messages} from '../messages';

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

	public async runScanner(workspaceTargets: string[]): Promise<void> {
		const startTime = Date.now();
		await this.scannerStrategy.validateEnvironment();

		this.display.displayProgress(messages.scanProgressReport.identifyingTargets);

		this.display.displayProgress(messages.scanProgressReport.analyzingTargets);

		this.display.displayLog(messages.info.scanningWith(this.scannerStrategy.getScannerName()));

		const results: DiagnosticConvertible[] = await this.scannerStrategy.scan(workspaceTargets);

		this.display.displayProgress(messages.scanProgressReport.processingResults);

		this.diagnosticManager.displayAsDiagnostics(workspaceTargets, results);

		this.telemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_STATIC_ANALYSIS, {
			commandName: this.commandName,
			duration: (Date.now() - startTime).toString()
		});

		// This has to be a floating promise, because progress bars won't disappear otherwise.
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		this.display.displayResults(workspaceTargets, results);
	}
}
