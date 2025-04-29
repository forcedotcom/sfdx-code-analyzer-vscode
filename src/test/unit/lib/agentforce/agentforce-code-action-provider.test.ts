import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts
import {AgentforceCodeActionProvider} from "../../../../lib/agentforce/agentforce-code-action-provider";
import {SpyLLMService, SpyLogger, StubLLMServiceProvider} from "../../stubs";
import {StubCodeActionContext} from "../../vscode-stubs";
import {messages} from "../../../../lib/messages";
import {createTextDocument} from "jest-mock-vscode";
import {createSampleCodeAnalyzerDiagnostic} from "../../test-utils";

describe('AgentforceCodeActionProvider Tests', () => {
    let spyLLMService: SpyLLMService;
    let llmServiceProvider: StubLLMServiceProvider;
    let spyLogger: SpyLogger;
    let actionProvider: AgentforceCodeActionProvider;

    beforeEach(() => {
        spyLLMService = new SpyLLMService();
        llmServiceProvider = new StubLLMServiceProvider(spyLLMService);
        spyLogger = new SpyLogger();
        actionProvider = new AgentforceCodeActionProvider(llmServiceProvider, spyLogger);
    });

    describe('provideCodeActions Tests', () => {
        const sampleUri: vscode.Uri = vscode.Uri.file('/someFile.cls');
        const sampleDocument: vscode.TextDocument = createTextDocument(sampleUri,'sampleContent', 'apex');
        const range: vscode.Range = new vscode.Range(1, 0, 5, 6);
        const compatibleRange1: vscode.Range = new vscode.Range(3, 1, 4, 5); // completely contained
        const compatibleRange2: vscode.Range = new vscode.Range(4, 1, 5, 9); // partially overlaps
        const incompatibleRange: vscode.Range = new vscode.Range(5, 7, 7, 0);
        const supportedDiag1: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, range, 'ApexBadCrypto');
        const supportedDiag2: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, compatibleRange1, 'ApexDangerousMethods');
        const supportedDiag3: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, compatibleRange2, 'InaccessibleAuraEnabledGetter');
        const unsupportedDiag1: vscode.Diagnostic = createSampleDiagnostic('some other diagnostic', 'ApexBadCrypto', range);
        const unsupportedDiag2: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, incompatibleRange, 'ApexBadCrypto');
        const unsupportedDiag3: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, range, 'UnsupportedRuleName');

        it('When a single supported diagnostic is in the context, then should return the one code action with correctly filled in fields', async () => {
            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [supportedDiag1]});
            const codeActions: vscode.CodeAction[] = await actionProvider.provideCodeActions(sampleDocument, range, context, undefined);

            expect(codeActions).toHaveLength(1);
            expect(codeActions[0].title).toEqual(messages.agentforce.fixViolationWithA4D('ApexBadCrypto'));
            expect(codeActions[0].kind).toEqual(vscode.CodeActionKind.QuickFix);
            expect(codeActions[0].diagnostics).toEqual([supportedDiag1]);
            expect(codeActions[0].command).toEqual({
                arguments: [sampleDocument, supportedDiag1],
                command: 'sfca.a4dFix',
                title: 'Fix Diagnostic Issue'});
        });

        it('When no supported diagnostic is in the context, then should return no code actions', async () => {
            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [unsupportedDiag1]});
            const codeActions: vscode.CodeAction[] = await actionProvider.provideCodeActions(sampleDocument, range, context, undefined);

            expect(codeActions).toHaveLength(0);
        });

        it('When a mix of supported and unsupported diagnostics are in the context, then should return just code actions for the supported diagnostics', async () => {
            const context: vscode.CodeActionContext = new StubCodeActionContext({
                diagnostics: [supportedDiag1, supportedDiag2, unsupportedDiag1, unsupportedDiag2, unsupportedDiag3, supportedDiag3]
            });
            const codeActions: vscode.CodeAction[] = await actionProvider.provideCodeActions(sampleDocument, range, context, undefined);

            expect(codeActions).toHaveLength(3);
            expect(codeActions[0].diagnostics).toEqual([supportedDiag1]);
            expect(codeActions[1].diagnostics).toEqual([supportedDiag2]);
            expect(codeActions[2].diagnostics).toEqual([supportedDiag3]);
        });

        it('When the LLMService is unavailable, then warn once and return no code actions', async () => {
            llmServiceProvider.isLLMServiceAvailableReturnValue = false;
            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [supportedDiag1]});
            const codeActions: vscode.CodeAction[] = await actionProvider.provideCodeActions(sampleDocument, range, context, undefined);
            await actionProvider.provideCodeActions(sampleDocument, range, context, undefined); // Sanity check that multiple calls do not produce additional warnings

            expect(codeActions).toHaveLength(0);
            expect(spyLogger.warnCallHistory).toHaveLength(1);
            expect(spyLogger.warnCallHistory[0]).toEqual({msg: messages.agentforce.a4dQuickFixUnavailable});
        });
    });
});

function createSampleDiagnostic(source: string, code: string, range: vscode.Range): vscode.Diagnostic {
    const diagnostic: vscode.Diagnostic = new vscode.Diagnostic(range, 'dummy message');
    diagnostic.source = source
    diagnostic.code = code;
    return diagnostic;
}
