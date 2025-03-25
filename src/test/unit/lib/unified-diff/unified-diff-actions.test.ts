import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts
import {UnifiedDiffActions} from "../../../../lib/unified-diff/unified-diff-actions";
import {
    SpyLogger,
    SpyTelemetryService,
    SpyUnifiedDiffTool,
    ThrowingUnifiedDiffTool
} from "../../stubs";
import {createTextDocument} from "jest-mock-vscode";

describe('UnifiedDiffActions Tests', () => {
    const throwingUnifiedDiffTool: ThrowingUnifiedDiffTool = new ThrowingUnifiedDiffTool();
    const sampleDocument: vscode.TextDocument = createTextDocument(vscode.Uri.file('someFile.cls'),'dummyContent','apex');
    const dummyDiffHunk = {dummy: 1};

    let spyUnifiedDiffTool: SpyUnifiedDiffTool;
    let spyTelemetryService: SpyTelemetryService;
    let spyLogger: SpyLogger;
    let unifiedDiffActions: UnifiedDiffActions<object>;

    beforeEach(() => {
        spyUnifiedDiffTool = new SpyUnifiedDiffTool();
        spyTelemetryService = new SpyTelemetryService();
        spyLogger = new SpyLogger();
        unifiedDiffActions = new UnifiedDiffActions(spyUnifiedDiffTool, spyTelemetryService, spyLogger);
    });

    describe('createDiff Tests', () => {
        it('When createDiff is called then it properly delegates to the unified diff tool and reports telemetry', async () => {
            const suggestedNewDocumentCode = 'dummy replacement code for the entire document';
            await unifiedDiffActions.createDiff('dummyCommandSource', sampleDocument, suggestedNewDocumentCode);

            expect(spyUnifiedDiffTool.createDiffCallHistory).toHaveLength(1);
            expect(spyUnifiedDiffTool.createDiffCallHistory[0].code).toEqual(suggestedNewDocumentCode);
            expect(spyUnifiedDiffTool.createDiffCallHistory[0].file).toContain('someFile.cls');

            expect(spyTelemetryService.sendCommandEventCallHistory).toHaveLength(1);
            expect(spyTelemetryService.sendCommandEventCallHistory[0]).toEqual({
                commandName: "sfdx__eGPT_suggest",
                properties: {
                    commandSource: 'dummyCommandSource',
                    languageType: 'apex'
                }
            });
        });

        it('When createDiff is called but the unified diff tool throws exception, then we log error and send exception telemetry event', async () => {
            unifiedDiffActions = new UnifiedDiffActions(throwingUnifiedDiffTool, spyTelemetryService, spyLogger);
            const suggestedNewDocumentCode = 'dummy replacement code for the entire document';
            await unifiedDiffActions.createDiff('dummyCommandSource', sampleDocument, suggestedNewDocumentCode);

            expect(spyTelemetryService.sendCommandEventCallHistory).toHaveLength(0);
            expect(spyTelemetryService.sendExceptionCallHistory).toHaveLength(1);
            expect(spyTelemetryService.sendExceptionCallHistory[0].name).toEqual('sfdx__eGPT_suggest_failure');

            expect(spyLogger.errorCallHistory).toHaveLength(1);
            expect(spyLogger.errorCallHistory[0]).toEqual({
                msg: 'sfdx__eGPT_suggest_failure: Error from createDiff'
            });
        });
    });

    describe('acceptAll Tests', () => {
        it('When acceptAll is called then it properly delegates to the unified diff tool and reports telemetry', async () => {
            await unifiedDiffActions.acceptAll('dummyCommandSource', sampleDocument);

            expect(spyUnifiedDiffTool.acceptAllCallCount).toEqual(1);

            expect(spyTelemetryService.sendCommandEventCallHistory).toHaveLength(1);
            expect(spyTelemetryService.sendCommandEventCallHistory[0]).toEqual({
                commandName: "sfdx__eGPT_accept",
                properties: {
                    commandSource: 'dummyCommandSource',
                    completionNumLines: '16',
                    languageType: 'apex'
                }
            });
        });

        it('When acceptAll is called but the unified diff tool throws exception, then we log error and send exception telemetry event', async () => {
            unifiedDiffActions = new UnifiedDiffActions(throwingUnifiedDiffTool, spyTelemetryService, spyLogger);
            await unifiedDiffActions.acceptAll('dummyCommandSource', sampleDocument);

            expect(spyTelemetryService.sendCommandEventCallHistory).toHaveLength(0);
            expect(spyTelemetryService.sendExceptionCallHistory).toHaveLength(1);
            expect(spyTelemetryService.sendExceptionCallHistory[0].name).toEqual('sfdx__eGPT_accept_failure');

            expect(spyLogger.errorCallHistory).toHaveLength(1);
            expect(spyLogger.errorCallHistory[0]).toEqual({
                msg: 'sfdx__eGPT_accept_failure: Error from acceptAll'
            });
        });
    });

    describe('acceptDiffHunk Tests', () => {
        it('When acceptDiffHunk is called then it properly delegates to the unified diff tool and reports telemetry', async () => {
            await unifiedDiffActions.acceptDiffHunk('dummyCommandSource', sampleDocument, dummyDiffHunk);

            expect(spyUnifiedDiffTool.acceptDiffHunkCallHistory).toHaveLength(1);
            expect(spyUnifiedDiffTool.acceptDiffHunkCallHistory[0]).toEqual({
                diffHunk: dummyDiffHunk
            });

            expect(spyTelemetryService.sendCommandEventCallHistory).toHaveLength(1);
            expect(spyTelemetryService.sendCommandEventCallHistory[0]).toEqual({
                commandName: "sfdx__eGPT_accept",
                properties: {
                    commandSource: 'dummyCommandSource',
                    completionNumLines: '9',
                    languageType: 'apex'
                }
            });
        });

        it('When acceptDiffHunk is called but the unified diff tool throws exception, then we log error and send exception telemetry event', async () => {
            unifiedDiffActions = new UnifiedDiffActions(throwingUnifiedDiffTool, spyTelemetryService, spyLogger);
            await unifiedDiffActions.acceptDiffHunk('dummyCommandSource', sampleDocument, dummyDiffHunk);

            expect(spyTelemetryService.sendCommandEventCallHistory).toHaveLength(0);
            expect(spyTelemetryService.sendExceptionCallHistory).toHaveLength(1);
            expect(spyTelemetryService.sendExceptionCallHistory[0].name).toEqual('sfdx__eGPT_accept_failure');

            expect(spyLogger.errorCallHistory).toHaveLength(1);
            expect(spyLogger.errorCallHistory[0]).toEqual({
                msg: 'sfdx__eGPT_accept_failure: Error from acceptDiffHunk'
            });
        });
    });

    describe('rejectAll Tests', () => {
        it('When rejectAll is called then it properly delegates to the unified diff tool and reports telemetry', async () => {
            await unifiedDiffActions.rejectAll('dummyCommandSource', sampleDocument);

            expect(spyUnifiedDiffTool.rejectAllCallCount).toEqual(1);

            expect(spyTelemetryService.sendCommandEventCallHistory).toHaveLength(1);
            expect(spyTelemetryService.sendCommandEventCallHistory[0]).toEqual({
                commandName: "sfdx__eGPT_clear",
                properties: {
                    commandSource: 'dummyCommandSource',
                    languageType: 'apex'
                }
            });
        });

        it('When rejectAll is called but the the unified diff tool throws exception, then we log error and send exception telemetry event', async () => {
            unifiedDiffActions = new UnifiedDiffActions(throwingUnifiedDiffTool, spyTelemetryService, spyLogger);
            await unifiedDiffActions.rejectAll('dummyCommandSource', sampleDocument);

            expect(spyTelemetryService.sendCommandEventCallHistory).toHaveLength(0);
            expect(spyTelemetryService.sendExceptionCallHistory).toHaveLength(1);
            expect(spyTelemetryService.sendExceptionCallHistory[0].name).toEqual('sfdx__eGPT_clear_failure');

            expect(spyLogger.errorCallHistory).toHaveLength(1);
            expect(spyLogger.errorCallHistory[0]).toEqual({
                msg: 'sfdx__eGPT_clear_failure: Error from rejectAll'
            });
        });
    });

    describe('rejectDiffHunk Tests', () => {
        it('When rejectDiffHunk is called then it properly delegates to the unified diff tool and reports telemetry', async () => {
            await unifiedDiffActions.rejectDiffHunk('dummyCommandSource', sampleDocument, dummyDiffHunk);

            expect(spyUnifiedDiffTool.rejectDiffHunkCallHistory).toHaveLength(1);
            expect(spyUnifiedDiffTool.rejectDiffHunkCallHistory[0]).toEqual({
                diffHunk: dummyDiffHunk
            });

            expect(spyTelemetryService.sendCommandEventCallHistory).toHaveLength(1);
            expect(spyTelemetryService.sendCommandEventCallHistory[0]).toEqual({
                commandName: "sfdx__eGPT_clear",
                properties: {
                    commandSource: 'dummyCommandSource',
                    languageType: 'apex'
                }
            });
        });

        it('When rejectDiffHunk is called but the unified diff tool throws exception, then we log error and send exception telemetry event', async () => {
            unifiedDiffActions = new UnifiedDiffActions(throwingUnifiedDiffTool, spyTelemetryService, spyLogger);
            await unifiedDiffActions.rejectDiffHunk('dummyCommandSource', sampleDocument, dummyDiffHunk);

            expect(spyTelemetryService.sendCommandEventCallHistory).toHaveLength(0);
            expect(spyTelemetryService.sendExceptionCallHistory).toHaveLength(1);
            expect(spyTelemetryService.sendExceptionCallHistory[0].name).toEqual('sfdx__eGPT_clear_failure');

            expect(spyLogger.errorCallHistory).toHaveLength(1);
            expect(spyLogger.errorCallHistory[0]).toEqual({
                msg: 'sfdx__eGPT_clear_failure: Error from rejectDiffHunk'
            });
        });
    });
});
