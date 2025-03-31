import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts

import {ScannerAction} from "../../../../lib/actions/scanner-action";
import {SpyDisplay, SpyLogger, SpyTelemetryService, StubScannerStrategy} from "../../stubs";
import {CodeLocation, DiagnosticManager, DiagnosticManagerImpl, Violation} from "../../../../lib/diagnostics";
import {FakeDiagnosticCollection} from "../../vscode-stubs";

describe('Tests for ScannerAction', () => {
    let scannerStrategy: StubScannerStrategy;
    let diagnosticCollection: vscode.DiagnosticCollection;
    let diagnosticManager: DiagnosticManager;
    let telemetryService: SpyTelemetryService;
    let logger: SpyLogger;
    let display: SpyDisplay;
    let scannerAction: ScannerAction;

    beforeEach(() => {
        scannerStrategy = new StubScannerStrategy();
        diagnosticCollection = new FakeDiagnosticCollection();
        diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);
        telemetryService = new SpyTelemetryService();
        logger = new SpyLogger();
        display = new SpyDisplay();
        scannerAction = new ScannerAction('dummyCommandName', scannerStrategy, diagnosticManager, telemetryService,
            logger, display);
    });

    it('When scan results in violations that are not associated with a file location, then show violation as display messages', async () => {
        scannerStrategy.scanReturnValue = [
            createSampleViolation('A', 1, [{}]),
            createSampleViolation('B', 2, []),
            createSampleViolation('C', 2, [{file: 'someFile.cls'}]), // Is sufficient to make this into a diagnostic
            createSampleViolation('D', 3, [{}]),
            createSampleViolation('E', 4, [{}]),
            createSampleViolation('F', 5, [{}])
        ];

        await scannerAction.runScanner(['someFile.cls']);

        expect(display.displayErrorCallHistory).toEqual([
            {msg: '[engineA:ruleA] messageA'},
            {msg: '[engineB:ruleB] messageB'}
        ]);
        expect(display.displayWarningCallHistory).toEqual([
            {msg: '[engineD:ruleD] messageD'},
            {msg: '[engineE:ruleE] messageE'}
        ]);
        expect(display.displayInfoCallHistory).toEqual([
            {msg: '[engineF:ruleF] messageF'},
            {msg: 'Scan complete. Analyzed 1 files. 1 violations found in 1 files.'}
        ]);

        // Sanity check, good violations still make it
        expect(diagnosticCollection.get(vscode.Uri.file('someFile.cls'))).toHaveLength(1);
    });


    // TODO: Eventually, we want to add in the rest of the tests for all the other cases.
});


function createSampleViolation(suffix: string, severityLevel: number, locations: CodeLocation[]): Violation {
    return {
        rule: `rule${suffix}`,
        engine: `engine${suffix}`,
        message: `message${suffix}`,
        severity: severityLevel,
        locations: locations,
        primaryLocationIndex: 0,
        resources: []
    };
}
