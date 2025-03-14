import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts
import {
    SpyLLMService,
    SpyLogger,
    StubLLMServiceProvider,
    ThrowingLLMService,
    ThrowingLLMServiceProvider
} from "../../stubs";
import {AgentforceViolationFixer} from "../../../../lib/agentforce/agentforce-violation-fixer";
import {createTextDocument} from 'jest-mock-vscode'
import {FixSuggestion} from "../../../../lib/fix-suggestion";
import {messages} from "../../../../lib/messages";

describe('AgentforceViolationFixer Tests', () => {
    let spyLLMService: SpyLLMService;
    let llmServiceProvider: StubLLMServiceProvider;
    let spyLogger: SpyLogger;
    let violationFixer: AgentforceViolationFixer;

    beforeEach(() => {
        spyLLMService = new SpyLLMService();
        llmServiceProvider = new StubLLMServiceProvider(spyLLMService);
        spyLogger = new SpyLogger();
        violationFixer = new AgentforceViolationFixer(llmServiceProvider, spyLogger);
    });

    describe('suggestFix Tests', () => {
        const sampleContent: string =
            'This is some dummy content\n' +
            'that is multi-line\n' +
            '  with spaces and such\n' +
            '  within the content.';
        const sampleDocument: vscode.TextDocument = createTextDocument(vscode.Uri.file('dummy.cls'), sampleContent, 'apex');
        const sampleRange: vscode.Range = new vscode.Range(0, 8, 1, 7);
        const sampleDiagnostic: vscode.Diagnostic = new vscode.Diagnostic(sampleRange, 'dummy message');

        it('When response is valid JSON with fixedCode and an explanation, then return the fix suggestion correctly', async () => {
            spyLLMService.callLLMReturnValue = '{"fixedCode": "some code fix", "explanation": "some explanation"}';
            const fixSuggestion: FixSuggestion = await violationFixer.suggestFix(sampleDocument, sampleDiagnostic);
            expect(fixSuggestion).toBeDefined();
            expect(fixSuggestion.codeFixData.document).toEqual(sampleDocument);
            expect(fixSuggestion.codeFixData.diagnostic).toEqual(sampleDiagnostic);
            // Important, we expand the range by default to include the full lines of the violation:
            expect(fixSuggestion.codeFixData.rangeToBeFixed).toEqual(new vscode.Range(0, 0, 1, 18));
            expect(fixSuggestion.codeFixData.fixedCode).toEqual('some code fix');
            expect(fixSuggestion.hasExplanation()).toEqual(true);
            expect(fixSuggestion.getExplanation()).toEqual('some explanation');
        });

        it('When response is valid JSON with fixedCode but without an explanation, then return the fix suggestion correctly', async () => {
            spyLLMService.callLLMReturnValue = '{"fixedCode": "some code fix"}';
            const fixSuggestion: FixSuggestion = await violationFixer.suggestFix(sampleDocument, sampleDiagnostic);
            expect(fixSuggestion).toBeDefined();
            expect(fixSuggestion.hasExplanation()).toEqual(false);
            expect(fixSuggestion.getExplanation()).toEqual('');
            expect(fixSuggestion.codeFixData.fixedCode).toEqual('some code fix');
        });

        it('When response is valid JSON but without fixedCode, then return null, show error message, and log error', async () => {
            spyLLMService.callLLMReturnValue = '{"useless":3}';
            const fixSuggestion: FixSuggestion = await violationFixer.suggestFix(sampleDocument, sampleDiagnostic);
            expect(fixSuggestion).toBeNull();
            expectErrorGettingShownCorrectly("Response from LLM is missing the 'fixedCode' property.");
        });

        it('When response is invalid JSON, then return null, show error message, and log error', async () => {
            spyLLMService.callLLMReturnValue = 'oops - not json';
            const fixSuggestion: FixSuggestion = await violationFixer.suggestFix(sampleDocument, sampleDiagnostic);
            expect(fixSuggestion).toBeNull();
            expectErrorGettingShownCorrectly('Response from LLM is not valid JSON');
        });

        it('When LLMServiceProvider throws an exception, then show error message and log error', async () => {
            violationFixer = new AgentforceViolationFixer(new ThrowingLLMServiceProvider(), spyLogger);
            const fixSuggestion: FixSuggestion = await violationFixer.suggestFix(sampleDocument, sampleDiagnostic);
            expect(fixSuggestion).toBeNull();
            expectErrorGettingShownCorrectly('Error from getLLMService');
        });

        it('When LLMService throws an exception, then show error message and log error', async () => {
            llmServiceProvider = new StubLLMServiceProvider(new ThrowingLLMService());
            violationFixer = new AgentforceViolationFixer(llmServiceProvider, spyLogger);
            const fixSuggestion: FixSuggestion = await violationFixer.suggestFix(sampleDocument, sampleDiagnostic);
            expect(fixSuggestion).toBeNull();
            expectErrorGettingShownCorrectly('Error from callLLM');
        });

        function expectErrorGettingShownCorrectly(expectErrorSubMessage: string): void {
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining(messages.agentforce.failedA4DResponse));
            expect(spyLogger.errorCallHistory).toHaveLength(1);
            expect(spyLogger.errorCallHistory[0].msg).toContain(messages.agentforce.failedA4DResponse);
            expect(spyLogger.errorCallHistory[0].msg).toContain(expectErrorSubMessage);
        }
    });
});
