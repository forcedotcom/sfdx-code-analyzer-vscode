import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts

import {FakeTaskWithProgressRunner, SpyDisplay, SpyLogger, SpyTelemetryService, StubCodeAnalyzer} from "../stubs";
import {CodeLocation, DiagnosticManager, DiagnosticManagerImpl, Violation} from "../../../lib/diagnostics";
import {FakeDiagnosticCollection} from "../vscode-stubs";
import {CodeAnalyzerRunAction, UNINSTANTIABLE_ENGINE_RULE} from "../../../lib/code-analyzer-run-action";
import {messages} from "../../../lib/messages";
import * as Constants from '../../../lib/constants';
import {WorkspaceState} from "../../../lib/vscode/workspace-state";
import * as utils from "../../../lib/utils";

describe('Tests for CodeAnalyzerRunAction', () => {
    let taskWithProgressRunner: FakeTaskWithProgressRunner;
    let codeAnalyzer: StubCodeAnalyzer;
    let diagnosticCollection: vscode.DiagnosticCollection;
    let diagnosticManager: DiagnosticManager;
    let telemetryService: SpyTelemetryService;
    let logger: SpyLogger;
    let display: SpyDisplay;
    let codeAnalyzerRunAction: CodeAnalyzerRunAction;
    let workspaceGetStub: WorkspaceState;
    let workspaceSetStub: WorkspaceState;

    beforeEach(() => {
        taskWithProgressRunner = new FakeTaskWithProgressRunner();
        codeAnalyzer = new StubCodeAnalyzer();
        diagnosticCollection = new FakeDiagnosticCollection();
        diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);
        telemetryService = new SpyTelemetryService();
        logger = new SpyLogger();
        display = new SpyDisplay();
        codeAnalyzerRunAction = new CodeAnalyzerRunAction(taskWithProgressRunner, codeAnalyzer, diagnosticManager,
            telemetryService, logger, display);
        workspaceGetStub = jest.spyOn(WorkspaceState, 'getValue').mockReturnValue(false);
        workspaceSetStub = jest.spyOn(WorkspaceState, 'setValue').mockReturnValue(undefined);
        jest.spyOn(utils, 'getCurrentDate').mockReturnValue('YYYY-MM-DD');
    });

    it('When scan results in violations that are not associated with a file location, then show violation as display messages', async () => {
        codeAnalyzer.scanReturnValue = [
            createSampleViolation('A', 1, [{}]),
            createSampleViolation('B', 2, []),
            createSampleViolation('C', 2, [{file: 'someFile.cls'}]), // Is sufficient to make this into a diagnostic
            createSampleViolation('D', 3, [{}]),
            createSampleViolation('E', 4, [{}]),
            createSampleViolation('F', 5, [{}])
        ];

        await codeAnalyzerRunAction.run('dummyCommandName', ['someFile.cls']);

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

    it('When scan determines that engines that cannot be initialized, then show violation as an error message', async () => {
        const engine = 'flow';
        codeAnalyzer.scanReturnValue = [
            createUninstantiableViolation(engine, 1, [{}]),
        ];

        await codeAnalyzerRunAction.run('dummyCommandName', ['someFile.flow-meta.xml']);

        expect(display.displayErrorCallHistory).toEqual([
            {msg: messages.error.engineUninstantiable(engine)}
        ]);
        expect(display.displayWarningCallHistory).toEqual([]);
        expect(display.displayInfoCallHistory).toEqual([
            {msg: 'Scan complete. Analyzed 1 files. 0 violations found in 0 files.'}
        ]);

        expect(workspaceGetStub).toHaveBeenCalled();
        // Confirm we won't see the message during the same day
        expect(workspaceSetStub).toHaveBeenCalledWith(`${Constants.ENGINE_WARNING_PREFIX}${engine}_YYYY-MM-DD`, true);
    });

    it('When engines cannot be initialized and user has already seen the error message, then do not show another error message', async () => {
        workspaceGetStub = jest.spyOn(WorkspaceState, 'getValue').mockReturnValue(true);
        codeAnalyzer.scanReturnValue = [
            createUninstantiableViolation('flow', 1, [{}]),
        ];

        await codeAnalyzerRunAction.run('dummyCommandName', ['someFile.flow-meta.xml']);

        expect(display.displayErrorCallHistory).toEqual([]);
        expect(display.displayWarningCallHistory).toEqual([]);
        expect(display.displayInfoCallHistory).toEqual([
            {msg: 'Scan complete. Analyzed 1 files. 0 violations found in 0 files.'}
        ]);
        expect(workspaceGetStub).toHaveBeenCalled();
        expect(workspaceSetStub).not.toHaveBeenCalled();
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
        tags: [],
        resources: []
    };
}

function createUninstantiableViolation(suffix: string, severityLevel: number, locations: CodeLocation[]): Violation {
    return {
        rule: UNINSTANTIABLE_ENGINE_RULE,
        engine: `${suffix}`,
        message: `message${suffix}`,
        severity: severityLevel,
        locations: locations,
        primaryLocationIndex: 0,
        tags: [],
        resources: []
    };
}