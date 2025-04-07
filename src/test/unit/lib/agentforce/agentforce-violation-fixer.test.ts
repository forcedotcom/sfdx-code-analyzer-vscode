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
import {CodeAnalyzerDiagnostic} from "../../../../lib/diagnostics";
import {createSampleCodeAnalyzerDiagnostic} from "../../test-utils";

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
        const sampleDiagnostic: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(vscode.Uri.file('dummy.cls'),
            new vscode.Range(0, 8, 1, 7), 'ApexCRUDViolation');

        it('When response is valid JSON with fixedCode and an explanation, then return the fix suggestion correctly', async () => {
            spyLLMService.callLLMReturnValue = '{"fixedCode": "some code fix", "explanation": "some explanation"}';
            const fixSuggestion: FixSuggestion = await violationFixer.suggestFix(sampleDocument, sampleDiagnostic);
            expect(fixSuggestion).not.toBeNull();
            expect(fixSuggestion.codeFixData.document).toEqual(sampleDocument);
            expect(fixSuggestion.codeFixData.diagnostic).toEqual(sampleDiagnostic);
            expect(fixSuggestion.codeFixData.rangeToBeFixed).toEqual(new vscode.Range(0, 0, 1, 18)); // Should be the full violation context
            expect(fixSuggestion.codeFixData.fixedCode).toEqual('some code fix');
            expect(fixSuggestion.hasExplanation()).toEqual(true);
            expect(fixSuggestion.getExplanation()).toEqual('some explanation');
        });

        it('When a rule should be sending in additional context, confirm the range gets adjusted appropriately', async () => {
            const fileContent: string =
                'public class SomeClass {\n' +
                '    public void someMethod() {\n' +
                '        Blob hardCodedIV = Blob.valueOf(\'Hardcoded IV 123\');\n' +
                '        Blob hardCodedKey = Blob.valueOf(\'0000000000000000\');\n' +
                '        Blob data = Blob.valueOf(\'Data to be encrypted\');\n' +
                '        Blob encrypted = Crypto.encrypt(\'AES128\', hardCodedKey, hardCodedIV, data);\n' +
                '    }\n' +
                '}';
            const document: vscode.TextDocument = createTextDocument(vscode.Uri.file('dummy.cls'), fileContent, 'apex');
            const diagnostic: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(vscode.Uri.file('dummy.cls'),
                new vscode.Range(5, 50, 5, 62), 'ApexBadCrypto');

            spyLLMService.callLLMReturnValue = '{"fixedCode": "some fixed code"}';

            const fixSuggestion: FixSuggestion = await violationFixer.suggestFix(document, diagnostic);
            expect(fixSuggestion).not.toBeNull();
            expect(fixSuggestion.codeFixData.document).toEqual(document);
            expect(fixSuggestion.codeFixData.diagnostic).toEqual(diagnostic);
            expect(fixSuggestion.codeFixData.rangeToBeFixed).toEqual(new vscode.Range(1, 0, 6, 5)); // Should be the full method context
            expect(fixSuggestion.codeFixData.fixedCode).toEqual('some fixed code');
        });

        it('When response is valid JSON with fixedCode but without an explanation, then return the fix suggestion correctly', async () => {
            spyLLMService.callLLMReturnValue = '{"fixedCode": "some code fix"}';
            const fixSuggestion: FixSuggestion = await violationFixer.suggestFix(sampleDocument, sampleDiagnostic);
            expect(fixSuggestion).not.toBeNull();
            expect(fixSuggestion.hasExplanation()).toEqual(false);
            expect(fixSuggestion.getExplanation()).toEqual('');
            expect(fixSuggestion.codeFixData.fixedCode).toEqual('some code fix');
        });

        it('When response is valid JSON but without fixedCode, then throw exception', async () => {
            spyLLMService.callLLMReturnValue = '{"useless":3}';
            await expect(violationFixer.suggestFix(sampleDocument, sampleDiagnostic)).rejects.toThrow(
                'Response from LLM is missing the \'fixedCode\' property.');
        });

        it('When response is invalid JSON, then throw exception', async () => {
            spyLLMService.callLLMReturnValue = 'oops - not json';
            await expect(violationFixer.suggestFix(sampleDocument, sampleDiagnostic)).rejects.toThrow(
                'Response from LLM is not valid JSON');
        });

        it('When LLMServiceProvider throws an exception, then throw exception', async () => {
            violationFixer = new AgentforceViolationFixer(new ThrowingLLMServiceProvider(), spyLogger);
            await expect(violationFixer.suggestFix(sampleDocument, sampleDiagnostic)).rejects.toThrow(
                'Error from getLLMService');
        });

        it('When LLMService throws an exception, then throw exception', async () => {
            llmServiceProvider = new StubLLMServiceProvider(new ThrowingLLMService());
            violationFixer = new AgentforceViolationFixer(llmServiceProvider, spyLogger);
            await expect(violationFixer.suggestFix(sampleDocument, sampleDiagnostic)).rejects.toThrow(
                'Error from callLLM');
        });

        it('When diagnostic is associated with an unsupported rule, then throw exception', async () => {
            const diagWithUnsupportedRule: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(vscode.Uri.file('dummy.cls'),
                new vscode.Range(0, 8, 1, 7), 'SomeRandomRule');
            await expect(violationFixer.suggestFix(sampleDocument, diagWithUnsupportedRule)).rejects.toThrow(
                'Unsupported rule: SomeRandomRule');
        });
    });
});
