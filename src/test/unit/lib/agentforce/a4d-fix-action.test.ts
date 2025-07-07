// import * as vscode from "vscode";// The vscode module is mocked out. See: scripts/setup.jest.ts
//
// import {CodeAnalyzerDiagnostic, DiagnosticManager, DiagnosticManagerImpl} from "../../../../lib/diagnostics";
// import * as stubs from "../../stubs";
// import {FakeDiagnosticCollection} from "../../vscode-stubs";
// import {A4DFixAction} from "../../../../lib/agentforce/a4d-fix-action";
// import {createTextDocument} from "jest-mock-vscode";
// import {createSampleCodeAnalyzerDiagnostic} from "../../test-utils";
// import {messages} from "../../../../lib/messages";
// import {FixSuggestion} from "../../../../lib/fix-suggestion";
//
// describe('Tests for A4DFixAction', () => {
//     const sampleUri: vscode.Uri = vscode.Uri.file('/some/file.cls');
//     const sampleDocument: vscode.TextDocument = createTextDocument(sampleUri, 'some\nsample content', 'apex');
//     const sampleDiagnostic1: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(0,0,0,1), 'ApexDoc');
//     const sampleDiagnostic2: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1,7,1,14));
//     const sampleFixSuggestion: FixSuggestion = new FixSuggestion({
//         document: sampleDocument,
//         diagnostic: sampleDiagnostic1,
//         rangeToBeFixed: new vscode.Range(0, 1, 0, 4),
//         fixedCode: 'someFixedCode'
//     });
//
//     let fixSuggester: stubs.SpyFixSuggester;
//     let unifiedDiffService: stubs.SpyUnifiedDiffService;
//     let diagnosticCollection: vscode.DiagnosticCollection;
//     let diagnosticManager: DiagnosticManager;
//     let telemetryService: stubs.SpyTelemetryService;
//     let logger: stubs.SpyLogger;
//     let display: stubs.SpyDisplay;
//     let a4dFixAction: A4DFixAction;
//
//     beforeEach(() => {
//         unifiedDiffService = new stubs.SpyUnifiedDiffService();
//         diagnosticCollection = new FakeDiagnosticCollection();
//         diagnosticCollection.set(sampleUri, [sampleDiagnostic1, sampleDiagnostic2]);
//         diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);
//         telemetryService = new stubs.SpyTelemetryService();
//         logger = new stubs.SpyLogger();
//         fixSuggester = new stubs.SpyFixSuggester();
//         display = new stubs.SpyDisplay();
//         a4dFixAction = new A4DFixAction(fixSuggester, unifiedDiffService, diagnosticManager, telemetryService, logger, display);
//     });
//
//     it('When unified diff service cannot show diff, then return without trying to show diff', async () => {
//         unifiedDiffService.verifyCanShowDiffReturnValue = false;
//
//         await a4dFixAction.run(sampleDocument, sampleDiagnostic1);
//
//         expect(display.displayWarningCallHistory).toHaveLength(0);
//         expect(unifiedDiffService.showDiffCallHistory).toHaveLength(0);
//
//         // Telemetry event is sent
//         expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
//         expect(telemetryService.sendCommandEventCallHistory[0]).toEqual({
//             commandName: 'sfdx__codeanalyzer_qf_no_fix_suggested',
//             properties: {
//                 commandSource: 'sfca.a4dFix',
//                 reason: 'unified_diff_cannot_be_shown'
//             }
//         });
//     });
//
//     it('When no fix is suggested (i.e. null is returned), then return with info msg displayed', async () => {
//         fixSuggester.suggestFixReturnValue = null;
//
//         await a4dFixAction.run(sampleDocument, sampleDiagnostic1);
//
//         expect(display.displayInfoCallHistory).toHaveLength(1);
//         expect(display.displayInfoCallHistory[0].msg).toEqual(messages.agentforce.noFixSuggested);
//         expect(unifiedDiffService.showDiffCallHistory).toHaveLength(0);
//         expect(diagnosticCollection.get(sampleUri)).toHaveLength(2); // Should still be 2
//
//         // Telemetry event is sent
//         expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
//         expect(telemetryService.sendCommandEventCallHistory[0]).toEqual({
//             commandName: 'sfdx__codeanalyzer_qf_no_fix_suggested',
//             properties: {
//                 commandSource: 'sfca.a4dFix',
//                 languageType: 'apex',
//                 reason: 'empty'
//             }
//         });
//     });
//
//     it('When error is thrown while suggesting fix, then display error message and send exception telemetry event', async () => {
//         const fixSuggester: stubs.ThrowingFixSuggester = new stubs.ThrowingFixSuggester();
//         a4dFixAction = new A4DFixAction(fixSuggester, unifiedDiffService, diagnosticManager, telemetryService, logger, display);
//
//         await a4dFixAction.run(sampleDocument, sampleDiagnostic1);
//
//         expect(display.displayErrorCallHistory).toHaveLength(1);
//         expect(display.displayErrorCallHistory[0].msg).toContain('Error thrown from: suggestFix');
//
//         expect(telemetryService.sendExceptionCallHistory).toHaveLength(1);
//         expect(telemetryService.sendExceptionCallHistory[0].errorMessage).toContain(
//             'Error thrown from: suggestFix');
//         expect(telemetryService.sendExceptionCallHistory[0].name).toEqual(
//             'sfdx__eGPT_suggest_failure');
//         expect(telemetryService.sendExceptionCallHistory[0].properties['executedCommand']).toEqual(
//             'sfca.a4dFix');
//     });
//
//     it('When fix is suggested, then the diff is displayed, the diagnostic is cleared, and a telemetry event is sent', async () => {
//         fixSuggester.suggestFixReturnValue = sampleFixSuggestion;
//
//         await a4dFixAction.run(sampleDocument, sampleDiagnostic1);
//
//         // Diff is displayed
//         expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
//         expect(unifiedDiffService.showDiffCallHistory[0].document).toEqual(sampleDocument);
//         expect(unifiedDiffService.showDiffCallHistory[0].newCode).toEqual('someFixedCode\nsample content');
//
//         // Diagnostic is cleared
//         expect(diagnosticCollection.get(sampleUri)).toEqual([ // sampleDiagnostic1 should be removed
//             sampleDiagnostic2 // but sampleDiagnostic2 should still remain
//         ]);
//
//         // Telemetry event is sent
//         expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
//         expect(telemetryService.sendCommandEventCallHistory[0]).toEqual({
//             commandName: 'sfdx__eGPT_suggest',
//             properties: {
//                 commandSource: 'sfca.a4dFix',
//                 completionNumLines: '1',
//                 languageType: 'apex',
//                 ruleName: 'ApexDoc'
//             }
//         });
//     });
//
//     it('When fix is suggested with an explanation, then diff is displayed and explanation is given by an info message display', async () => {
//         fixSuggester.suggestFixReturnValue = new FixSuggestion({
//             document: sampleDocument,
//             diagnostic: sampleDiagnostic2,
//             rangeToBeFixed: new vscode.Range(1, 0, 1, 17),
//             fixedCode: 'hello World'
//         }, 'This is some explanation');
//
//         await a4dFixAction.run(sampleDocument, sampleDiagnostic2);
//
//         // Diff is displayed
//         expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
//         expect(unifiedDiffService.showDiffCallHistory[0].document).toEqual(sampleDocument);
//         expect(unifiedDiffService.showDiffCallHistory[0].newCode).toEqual('some\nhello World');
//
//         expect(display.displayInfoCallHistory).toHaveLength(1);
//         expect(display.displayInfoCallHistory[0].msg).toEqual('Fix Explanation: This is some explanation');
//
//     });
//
//     it('When fix is suggested, then the accept callback (when executed) sends a telemetry event', async () => {
//         fixSuggester.suggestFixReturnValue = sampleFixSuggestion;
//
//         await a4dFixAction.run(sampleDocument, sampleDiagnostic2);
//
//         expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
//         await unifiedDiffService.showDiffCallHistory[0].acceptCallback();
//
//         expect(telemetryService.sendCommandEventCallHistory).toHaveLength(2);
//         expect(telemetryService.sendCommandEventCallHistory[1]).toEqual({
//             commandName: 'sfdx__eGPT_accept',
//             properties: {
//                 commandSource: 'sfca.a4dFix',
//                 completionNumLines: '1',
//                 languageType: 'apex',
//                 ruleName: 'ApexDoc'
//             }
//         });
//     });
//
//     it('When fix is suggested, then the reject callback (when executed) sends a telemetry event', async () => {
//         fixSuggester.suggestFixReturnValue = sampleFixSuggestion;
//
//         await a4dFixAction.run(sampleDocument, sampleDiagnostic1);
//
//         expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
//         await unifiedDiffService.showDiffCallHistory[0].rejectCallback();
//
//         expect(telemetryService.sendCommandEventCallHistory).toHaveLength(2);
//         expect(telemetryService.sendCommandEventCallHistory[1]).toEqual({
//             commandName: 'sfdx__eGPT_clear',
//             properties: {
//                 commandSource: 'sfca.a4dFix',
//                 completionNumLines: '1',
//                 languageType: 'apex',
//                 ruleName: 'ApexDoc'
//             }
//         });
//     });
//
//     it('When fix is suggested, but diff tool throws exception, then display error message, restore diagnostic, and send exception telemetry event', async () => {
//         const unifiedDiffService: stubs.ThrowingUnifiedDiffService = new stubs.ThrowingUnifiedDiffService();
//         a4dFixAction = new A4DFixAction(fixSuggester, unifiedDiffService, diagnosticManager, telemetryService, logger, display);
//
//         fixSuggester.suggestFixReturnValue = sampleFixSuggestion;
//
//         await a4dFixAction.run(sampleDocument, sampleDiagnostic1);
//
//         expect(display.displayErrorCallHistory).toHaveLength(1);
//         expect(display.displayErrorCallHistory[0].msg).toContain('Error thrown from: showDiff');
//
//         expect(telemetryService.sendExceptionCallHistory).toHaveLength(1);
//         expect(telemetryService.sendExceptionCallHistory[0].errorMessage).toContain(
//             'Error thrown from: showDiff');
//         expect(telemetryService.sendExceptionCallHistory[0].name).toEqual(
//             'sfdx__eGPT_suggest_failure');
//         expect(telemetryService.sendExceptionCallHistory[0].properties['executedCommand']).toEqual(
//             'sfca.a4dFix');
//
//         expect(diagnosticCollection.get(sampleUri)).toHaveLength(2); // Should still be 2
//     });
//
//     it('When fix suggested is exactly the same as the original code, then show info message saying that no fix was suggested', async () => {
//         fixSuggester.suggestFixReturnValue = new FixSuggestion({
//             document: sampleDocument,
//             diagnostic: sampleDiagnostic1,
//             rangeToBeFixed: new vscode.Range(0, 0, 0, 4),
//             fixedCode: 'some' // same as before
//         });;
//
//         await a4dFixAction.run(sampleDocument, sampleDiagnostic1);
//
//         expect(display.displayInfoCallHistory).toHaveLength(1);
//         expect(display.displayInfoCallHistory[0].msg).toEqual(messages.agentforce.noFixSuggested);
//         expect(unifiedDiffService.showDiffCallHistory).toHaveLength(0);
//         expect(diagnosticCollection.get(sampleUri)).toHaveLength(2); // Should still be 2
//
//         // Telemetry event is sent
//         expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
//         expect(telemetryService.sendCommandEventCallHistory[0]).toEqual({
//             commandName: 'sfdx__codeanalyzer_qf_no_fix_suggested',
//             properties: {
//                 commandSource: 'sfca.a4dFix',
//                 languageType: 'apex',
//                 reason: 'same_code'
//             }
//         });
//     });
// });
