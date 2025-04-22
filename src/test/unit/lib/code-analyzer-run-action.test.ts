import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts

import {
    FakeTaskWithProgressRunner,
    SpyDisplay,
    SpyLogger,
    SpyTelemetryService,
    SpyWindowManager,
    StubCodeAnalyzer
} from "../stubs";
import {CodeLocation, DiagnosticManager, DiagnosticManagerImpl, Violation} from "../../../lib/diagnostics";
import {FakeDiagnosticCollection} from "../vscode-stubs";
import {CodeAnalyzerRunAction, UNINSTANTIABLE_ENGINE_RULE} from "../../../lib/code-analyzer-run-action";
import {messages} from "../../../lib/messages";
import * as Constants from '../../../lib/constants';

describe('Tests for CodeAnalyzerRunAction', () => {
    let taskWithProgressRunner: FakeTaskWithProgressRunner;
    let codeAnalyzer: StubCodeAnalyzer;
    let diagnosticCollection: vscode.DiagnosticCollection;
    let diagnosticManager: DiagnosticManager;
    let telemetryService: SpyTelemetryService;
    let logger: SpyLogger;
    let display: SpyDisplay;
    let windowManager: SpyWindowManager;
    let codeAnalyzerRunAction: CodeAnalyzerRunAction;

    beforeEach(() => {
        taskWithProgressRunner = new FakeTaskWithProgressRunner();
        codeAnalyzer = new StubCodeAnalyzer();
        diagnosticCollection = new FakeDiagnosticCollection();
        diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);
        telemetryService = new SpyTelemetryService();
        logger = new SpyLogger();
        display = new SpyDisplay();
        windowManager = new SpyWindowManager();
        codeAnalyzerRunAction = new CodeAnalyzerRunAction(taskWithProgressRunner, codeAnalyzer, diagnosticManager,
            telemetryService, logger, display, windowManager);
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

        await codeAnalyzerRunAction.run('dummyCommandName', ['someFile.flow-meta.xml']);

        expect(display.displayErrorCallHistory).toHaveLength(1);
        expect(display.displayErrorCallHistory[0].msg).toEqual(messages.error.engineUninstantiable(engine));
        expect(display.displayWarningCallHistory).toEqual([]);
        expect(display.displayInfoCallHistory).toEqual([
            {msg: 'Scan complete. Analyzed 1 files. 0 violations found in 0 files.'}
        ]);
    });

    it('When an engine cannot be initialized and user ignores the message, then do not show that exact message again', async () => {
        const engine = 'flow';
        codeAnalyzer.scanReturnValue = [
            createViolationWithoutLocation(engine, UNINSTANTIABLE_ENGINE_RULE, 'some setup message')
        ];

        await codeAnalyzerRunAction.run('dummyCommandName', ['someFile.flow-meta.xml']);
        expect(display.displayErrorCallHistory).toHaveLength(1);
        expect(display.displayErrorCallHistory[0].msg).toEqual(messages.error.engineUninstantiable(engine));
        expect(logger.errorCallHistory).toHaveLength(1);
        expect(logger.errorCallHistory[0].msg).toEqual('some setup message\n\nLearn more: ' + Constants.DOCS_SETUP_LINK);
        expect(display.displayErrorCallHistory[0].buttons).toHaveLength(3);
        display.displayErrorCallHistory[0].buttons[1].callback(); // Invoke the 2nd button should ignore the error

        await codeAnalyzerRunAction.run('dummyCommandName', ['someFile.flow-meta.xml']);
        expect(display.displayErrorCallHistory).toHaveLength(1); // Should still be 1 because we ignored the error
    });

    it('When an engine cannot be initialized and user ignores the message, then we should still show other setup messages', async () => {
        const engine = 'flow';
        codeAnalyzer.scanReturnValue = [
            createViolationWithoutLocation(engine, UNINSTANTIABLE_ENGINE_RULE, 'some setup message1')
        ];

        await codeAnalyzerRunAction.run('dummyCommandName', ['someFile.flow-meta.xml']);
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

        await codeAnalyzerRunAction.run('dummyCommandName', ['someFile.flow-meta.xml']);
        expect(display.displayErrorCallHistory).toHaveLength(2); // Should still be 1 because we ignored the error
        expect(logger.errorCallHistory).toHaveLength(2);
        expect(logger.errorCallHistory[1].msg).toEqual('some setup message2\n\nLearn more: ' + Constants.DOCS_SETUP_LINK);
    });

    it('When an engine cannot be initialized and user clicks "Show error", then the log output window is put into focus', async () => {
        const engine = 'flow';
        codeAnalyzer.scanReturnValue = [
            createViolationWithoutLocation(engine, UNINSTANTIABLE_ENGINE_RULE, 'some setup message1')
        ];

        await codeAnalyzerRunAction.run('dummyCommandName', ['someFile.flow-meta.xml']);
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

        await codeAnalyzerRunAction.run('dummyCommandName', ['someFile.flow-meta.xml']);
        expect(display.displayErrorCallHistory).toHaveLength(1);
        expect(display.displayErrorCallHistory[0].msg).toEqual(messages.error.engineUninstantiable(engine));
        expect(display.displayErrorCallHistory[0].buttons).toHaveLength(3);
        expect(display.displayErrorCallHistory[0].buttons[2].text).toEqual(messages.buttons.learnMore);
        display.displayErrorCallHistory[0].buttons[2].callback(); // Invoke the 3rd button to open doc
        expect(windowManager.showExternalUrlCallHistory).toHaveLength(1);
        expect(windowManager.showExternalUrlCallHistory[0].url).toEqual(Constants.DOCS_SETUP_LINK);
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
