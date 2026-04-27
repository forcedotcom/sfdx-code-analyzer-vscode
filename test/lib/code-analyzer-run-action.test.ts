import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts

import {
    FakeTaskWithProgressRunner,
    SpyDisplay,
    SpyLogger,
    SpyTelemetryService,
    SpyWindowManager,
    StubCodeAnalyzer, StubFileHandler, StubSettingsManager, StubVscodeWorkspace
} from "../stubs";
import {CodeAnalyzerDiagnostic, CodeLocation, DiagnosticFactory, DiagnosticManager, DiagnosticManagerImpl, Violation} from "../../src/lib/diagnostics";
import {FakeDiagnosticCollection} from "../vscode-stubs";
import {CodeAnalyzerRunAction, UNINSTANTIABLE_ENGINE_RULE} from "../../src/lib/code-analyzer-run-action";
import {messages} from "../../src/lib/messages";
import * as Constants from '../../src/lib/constants';
import {Workspace} from "../../src/lib/workspace";
import { APEX_GURU_ENGINE_NAME } from "../../src/lib/apexguru/apex-guru-service";

describe('Tests for CodeAnalyzerRunAction', () => {
    let sampleWorkspace: Workspace;
    let taskWithProgressRunner: FakeTaskWithProgressRunner;
    let codeAnalyzer: StubCodeAnalyzer;
    let diagnosticCollection: vscode.DiagnosticCollection;
    let diagnosticManager: DiagnosticManager;
    let telemetryService: SpyTelemetryService;
    let logger: SpyLogger;
    let display: SpyDisplay;
    let windowManager: SpyWindowManager;
    let codeAnalyzerRunAction: CodeAnalyzerRunAction;

    beforeEach(async () => {
        sampleWorkspace = await Workspace.fromTargetPaths(['someFile.flow-meta.xml'], new StubVscodeWorkspace(), new StubFileHandler());

        taskWithProgressRunner = new FakeTaskWithProgressRunner();
        codeAnalyzer = new StubCodeAnalyzer();
        diagnosticCollection = new FakeDiagnosticCollection();
        const settingsManager = new StubSettingsManager();
        diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection, settingsManager);
        const diagnosticFactory = (diagnosticManager as DiagnosticManagerImpl).diagnosticFactory;
        telemetryService = new SpyTelemetryService();
        logger = new SpyLogger();
        display = new SpyDisplay();
        windowManager = new SpyWindowManager();
        codeAnalyzerRunAction = new CodeAnalyzerRunAction(taskWithProgressRunner, codeAnalyzer, diagnosticManager,
            diagnosticFactory, telemetryService, logger, display, windowManager);
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

        const workspace: Workspace = await Workspace.fromTargetPaths(['someFile.cls'], new StubVscodeWorkspace(), new StubFileHandler());
        await codeAnalyzerRunAction.run('dummyCommandName', workspace);

        expect(display.displayErrorCallHistory).toEqual([
            {msg: '[engineA:ruleA] messageA', buttons: []},
            {msg: '[engineB:ruleB] messageB', buttons: []},
        ]);
        expect(display.displayWarningCallHistory).toEqual([
            {msg: '[engineD:ruleD] messageD', buttons: []},
            {msg: '[engineE:ruleE] messageE', buttons: []},
        ]);
        expect(display.displayInfoCallHistory).toEqual([
            {msg: '[engineF:ruleF] messageF'},
            {msg: 'Scan complete. Analyzed 1 files. 1 violations found in 1 files.'}
        ]);

        // Sanity check, good violations still make it
        expect(diagnosticCollection.get(vscode.Uri.file('someFile.cls'))).toHaveLength(1);
    });

    it('When scan determines that engines that cannot be initialized, then show violation as an error message but continue scanning', async () => {
        const engine = 'flow';
        codeAnalyzer.scanReturnValue = [
            createViolationWithoutLocation(engine, UNINSTANTIABLE_ENGINE_RULE, 'some setup message')
        ];

        await codeAnalyzerRunAction.run('dummyCommandName', sampleWorkspace);

        expect(display.displayErrorCallHistory).toHaveLength(1);
        expect(display.displayErrorCallHistory[0].msg).toEqual(messages.error.engineUninstantiable(engine));
        expect(display.displayWarningCallHistory).toEqual([]);
        expect(display.displayInfoCallHistory).toEqual([
            {msg: 'Scan complete. Analyzed 1 files. 0 violations found in 0 files.'}
        ]);
    });

    it('When scan happens, it should clear old Code Analyzer diagnostics before setting new ones but keep existing ApexGuru diagnostics', async () => {
        const testDiagnosticFactory = new DiagnosticFactory(new StubSettingsManager());
        const diags = [
            testDiagnosticFactory.fromViolation({
                rule: 'dummyRule1',
                engine: APEX_GURU_ENGINE_NAME,
                message: 'messageFromApexGuru',
                severity: 3,
                locations: [{file: 'someFile.cls'}],
                primaryLocationIndex: 0,
                tags: [],
                resources: []
            }),
            testDiagnosticFactory.fromViolation({
                rule: 'dummyRule1',
                engine: 'pmd',
                message: 'messageFromPmd',
                severity: 3,
                locations: [{file: 'someFile.cls'}],
                primaryLocationIndex: 0,
                tags: [],
                resources: []
            })
        ].filter((d): d is CodeAnalyzerDiagnostic => d !== null);
        diagnosticManager.addDiagnostics(diags);
        codeAnalyzer.scanReturnValue = [
            createSampleViolation('New', 2, [{file: 'someFile.cls'}]), // Is sufficient to make this into a diagnostic
        ];
        const workspace: Workspace = await Workspace.fromTargetPaths(['someFile.cls'], new StubVscodeWorkspace(), new StubFileHandler());
        await codeAnalyzerRunAction.run('dummyCommandName', workspace);

        const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(vscode.Uri.file('someFile.cls')) as CodeAnalyzerDiagnostic[];
        expect(resultingDiags).toHaveLength(2);
        expect(resultingDiags.map(d => d.message)).toEqual(['Sev3: messageFromApexGuru', 'Sev2: messageNew']);
    });

    it('When an engine cannot be initialized and user ignores the message, then do not show that exact message again', async () => {
        const engine = 'flow';
        codeAnalyzer.scanReturnValue = [
            createViolationWithoutLocation(engine, UNINSTANTIABLE_ENGINE_RULE, 'some setup message')
        ];

        await codeAnalyzerRunAction.run('dummyCommandName', sampleWorkspace);
        expect(display.displayErrorCallHistory).toHaveLength(1);
        expect(display.displayErrorCallHistory[0].msg).toEqual(messages.error.engineUninstantiable(engine));
        expect(logger.errorCallHistory).toHaveLength(1);
        expect(logger.errorCallHistory[0].msg).toEqual('some setup message\n\nLearn more: ' + Constants.DOCS_SETUP_LINK);
        expect(display.displayErrorCallHistory[0].buttons).toHaveLength(3);
        display.displayErrorCallHistory[0].buttons[1].callback(); // Invoke the 2nd button should ignore the error

        await codeAnalyzerRunAction.run('dummyCommandName', sampleWorkspace);
        expect(display.displayErrorCallHistory).toHaveLength(1); // Should still be 1 because we ignored the error
    });

    it('When an engine cannot be initialized and user ignores the message, then we should still show other setup messages', async () => {
        const engine = 'flow';
        codeAnalyzer.scanReturnValue = [
            createViolationWithoutLocation(engine, UNINSTANTIABLE_ENGINE_RULE, 'some setup message1')
        ];

        await codeAnalyzerRunAction.run('dummyCommandName', sampleWorkspace);
        expect(display.displayErrorCallHistory).toHaveLength(1);
        expect(display.displayErrorCallHistory[0].msg).toEqual(messages.error.engineUninstantiable(engine));
        expect(logger.errorCallHistory).toHaveLength(1);
        expect(logger.errorCallHistory[0].msg).toEqual('some setup message1\n\nLearn more: https://developer.salesforce.com/docs/platform/salesforce-code-analyzer/guide/analyze-vscode.html#install-and-configure-code-analyzer-vs-code-extension');
        expect(display.displayErrorCallHistory[0].buttons).toHaveLength(3);
        expect(display.displayErrorCallHistory[0].buttons[1].text).toEqual(messages.buttons.ignoreError);
        display.displayErrorCallHistory[0].buttons[1].callback(); // Invoke the 2nd button should ignore the error

        codeAnalyzer.scanReturnValue = [
            createViolationWithoutLocation('pmd', UNINSTANTIABLE_ENGINE_RULE, 'some setup message2')
        ];

        await codeAnalyzerRunAction.run('dummyCommandName', sampleWorkspace);
        expect(display.displayErrorCallHistory).toHaveLength(2); // Should still be 1 because we ignored the error
        expect(logger.errorCallHistory).toHaveLength(2);
        expect(logger.errorCallHistory[1].msg).toEqual('some setup message2\n\nLearn more: ' + Constants.DOCS_SETUP_LINK);
    });

    it('When an engine cannot be initialized and user clicks "Show error", then the log output window is put into focus', async () => {
        const engine = 'flow';
        codeAnalyzer.scanReturnValue = [
            createViolationWithoutLocation(engine, UNINSTANTIABLE_ENGINE_RULE, 'some setup message1')
        ];

        await codeAnalyzerRunAction.run('dummyCommandName', sampleWorkspace);
        expect(display.displayErrorCallHistory).toHaveLength(1);
        expect(display.displayErrorCallHistory[0].msg).toEqual(messages.error.engineUninstantiable(engine));
        expect(display.displayErrorCallHistory[0].buttons).toHaveLength(3);
        expect(display.displayErrorCallHistory[0].buttons[0].text).toEqual(messages.buttons.showError);
        display.displayErrorCallHistory[0].buttons[0].callback(); // Invoke the 1st button should show the error
        expect(windowManager.showLogOutputWindowCallCount).toEqual(1);
    });


    it('When an engine cannot be initialized and user clicks "Learn more", then we open our documentation page', async () => {
        const engine = 'flow';
        codeAnalyzer.scanReturnValue = [
            createViolationWithoutLocation(engine, UNINSTANTIABLE_ENGINE_RULE, 'some setup message1')
        ];

        await codeAnalyzerRunAction.run('dummyCommandName', sampleWorkspace);
        expect(display.displayErrorCallHistory).toHaveLength(1);
        expect(display.displayErrorCallHistory[0].msg).toEqual(messages.error.engineUninstantiable(engine));
        expect(display.displayErrorCallHistory[0].buttons).toHaveLength(3);
        expect(display.displayErrorCallHistory[0].buttons[2].text).toEqual(messages.buttons.learnMore);
        display.displayErrorCallHistory[0].buttons[2].callback(); // Invoke the 3rd button to open doc
        expect(windowManager.showExternalUrlCallHistory).toHaveLength(1);
        expect(windowManager.showExternalUrlCallHistory[0].url).toEqual(Constants.DOCS_SETUP_LINK);
    });

    describe('Trigger propagation to telemetry', () => {
        it('When trigger is not provided (manual scan), then telemetry should receive TRIGGER_MANUAL', async () => {
            codeAnalyzer.scanReturnValue = [
                createSampleViolation('A', 2, [{file: 'someFile.cls'}])
            ];
            const workspace: Workspace = await Workspace.fromTargetPaths(['someFile.cls'], new StubVscodeWorkspace(), new StubFileHandler());

            await codeAnalyzerRunAction.run('dummyCommandName', workspace);

            expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
            expect(telemetryService.sendCommandEventCallHistory[0].commandName).toBe(Constants.TELEM_SUCCESSFUL_STATIC_ANALYSIS);
            expect(telemetryService.sendCommandEventCallHistory[0].properties.trigger).toBe(Constants.TRIGGER_MANUAL);
        });

        it('When trigger is TRIGGER_ON_SAVE, then telemetry should receive it', async () => {
            codeAnalyzer.scanReturnValue = [
                createSampleViolation('A', 2, [{file: 'someFile.cls'}])
            ];
            const workspace: Workspace = await Workspace.fromTargetPaths(['someFile.cls'], new StubVscodeWorkspace(), new StubFileHandler());

            await codeAnalyzerRunAction.run('dummyCommandName', workspace, Constants.TRIGGER_ON_SAVE);

            expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
            expect(telemetryService.sendCommandEventCallHistory[0].commandName).toBe(Constants.TELEM_SUCCESSFUL_STATIC_ANALYSIS);
            expect(telemetryService.sendCommandEventCallHistory[0].properties.trigger).toBe(Constants.TRIGGER_ON_SAVE);
        });

        it('When trigger is TRIGGER_ON_OPEN, then telemetry should receive it', async () => {
            codeAnalyzer.scanReturnValue = [
                createSampleViolation('A', 2, [{file: 'someFile.cls'}])
            ];
            const workspace: Workspace = await Workspace.fromTargetPaths(['someFile.cls'], new StubVscodeWorkspace(), new StubFileHandler());

            await codeAnalyzerRunAction.run('dummyCommandName', workspace, Constants.TRIGGER_ON_OPEN);

            expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
            expect(telemetryService.sendCommandEventCallHistory[0].commandName).toBe(Constants.TELEM_SUCCESSFUL_STATIC_ANALYSIS);
            expect(telemetryService.sendCommandEventCallHistory[0].properties.trigger).toBe(Constants.TRIGGER_ON_OPEN);
        });

        it('When scan fails with trigger TRIGGER_ON_SAVE, then exception telemetry should include trigger', async () => {
            codeAnalyzer.scan = async () => {
                throw new Error('Scan failed');
            };
            const workspace: Workspace = await Workspace.fromTargetPaths(['someFile.cls'], new StubVscodeWorkspace(), new StubFileHandler());

            await codeAnalyzerRunAction.run('dummyCommandName', workspace, Constants.TRIGGER_ON_SAVE);

            expect(telemetryService.sendExceptionCallHistory).toHaveLength(1);
            expect(telemetryService.sendExceptionCallHistory[0].name).toBe(Constants.TELEM_FAILED_STATIC_ANALYSIS);
            expect(telemetryService.sendExceptionCallHistory[0].properties?.trigger).toBe(Constants.TRIGGER_ON_SAVE);
        });

        it('When scan fails with trigger TRIGGER_ON_OPEN, then exception telemetry should include trigger', async () => {
            codeAnalyzer.scan = async () => {
                throw new Error('Scan failed');
            };
            const workspace: Workspace = await Workspace.fromTargetPaths(['someFile.cls'], new StubVscodeWorkspace(), new StubFileHandler());

            await codeAnalyzerRunAction.run('dummyCommandName', workspace, Constants.TRIGGER_ON_OPEN);

            expect(telemetryService.sendExceptionCallHistory).toHaveLength(1);
            expect(telemetryService.sendExceptionCallHistory[0].name).toBe(Constants.TELEM_FAILED_STATIC_ANALYSIS);
            expect(telemetryService.sendExceptionCallHistory[0].properties?.trigger).toBe(Constants.TRIGGER_ON_OPEN);
        });

        it('When scan fails without explicit trigger (manual), then exception telemetry should include TRIGGER_MANUAL', async () => {
            codeAnalyzer.scan = async () => {
                throw new Error('Scan failed');
            };
            const workspace: Workspace = await Workspace.fromTargetPaths(['someFile.cls'], new StubVscodeWorkspace(), new StubFileHandler());

            await codeAnalyzerRunAction.run('dummyCommandName', workspace);

            expect(telemetryService.sendExceptionCallHistory).toHaveLength(1);
            expect(telemetryService.sendExceptionCallHistory[0].name).toBe(Constants.TELEM_FAILED_STATIC_ANALYSIS);
            expect(telemetryService.sendExceptionCallHistory[0].properties?.trigger).toBe(Constants.TRIGGER_MANUAL);
        });
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

function createViolationWithoutLocation(engineName: string, rule: string, violationMsg: string): Violation {
    return {
        rule,
        engine: `${engineName}`,
        message: violationMsg,
        severity: 1,
        locations: [{}],
        primaryLocationIndex: 0,
        tags: [],
        resources: []
    };
}
