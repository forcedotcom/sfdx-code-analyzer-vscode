import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts

import {CodeAnalyzerDiagnostic, DiagnosticManager, DiagnosticManagerImpl} from "../../../../lib/diagnostics";
import * as stubs from "../../stubs";
import {FakeDiagnosticCollection} from "../../vscode-stubs";
import {A4DFixAction} from "../../../../lib/agentforce/a4d-fix-action";
import {createTextDocument} from "jest-mock-vscode";
import {createSampleCodeAnalyzerDiagnostic} from "../../test-utils";
import {messages} from "../../../../lib/messages";
import { LLMServiceProvider } from "../../../../lib/external-services/llm-service";
import { CodeAnalyzer } from "../../../../lib/code-analyzer";

describe('Tests for A4DFixAction', () => {
    const sampleUri: vscode.Uri = vscode.Uri.file('/some/file.cls');
    const sampleContent: string =
        'This is some dummy content\n' +
        'that is multi-line\n' +
        '  with spaces and such\n' +
        '  within the content.';
    const sampleDocument: vscode.TextDocument = createTextDocument(sampleUri, sampleContent, 'apex');
    // These diagnostics are associated with rules that only care about the ViolationScope (where the range expander expands to full lines)
    const sampleDiagForSingleLine: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(0,0,0,1), 'ApexAssertionsShouldIncludeMessage');
    const sampleDiagThatSpansTwoLines: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1,7,2,14), 'UnusedLocalVariable');

    let spyLLMService: stubs.SpyLLMService;
    let llmServiceProvider: LLMServiceProvider;
    let codeAnalyzer: stubs.StubCodeAnalyzer;
    let unifiedDiffService: stubs.SpyUnifiedDiffService;
    let diagnosticCollection: vscode.DiagnosticCollection;
    let diagnosticManager: DiagnosticManager;
    let telemetryService: stubs.SpyTelemetryService;
    let logger: stubs.SpyLogger;
    let display: stubs.SpyDisplay;
    let a4dFixAction: A4DFixAction;

    beforeEach(() => {
        spyLLMService = new stubs.SpyLLMService();
        llmServiceProvider = new stubs.StubLLMServiceProvider(spyLLMService);
        codeAnalyzer = new stubs.StubCodeAnalyzer();
        unifiedDiffService = new stubs.SpyUnifiedDiffService();
        diagnosticCollection = new FakeDiagnosticCollection();
        diagnosticCollection.set(sampleUri, [sampleDiagForSingleLine, sampleDiagThatSpansTwoLines]);
        diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);
        telemetryService = new stubs.SpyTelemetryService();
        logger = new stubs.SpyLogger();
        display = new stubs.SpyDisplay();
        a4dFixAction = new A4DFixAction(llmServiceProvider, codeAnalyzer, unifiedDiffService, diagnosticManager, telemetryService, logger, display);
    });

    it('When unified diff service cannot show diff, then return without trying to show diff', async () => {
        unifiedDiffService.verifyCanShowDiffReturnValue = false;

        await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);

        expect(display.displayWarningCallHistory).toHaveLength(0);
        expect(unifiedDiffService.showDiffCallHistory).toHaveLength(0);

        // Telemetry event is sent
        expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
        expect(telemetryService.sendCommandEventCallHistory[0]).toEqual({
            commandName: 'sfdx__codeanalyzer_qf_no_fix_suggested',
            properties: {
                commandSource: A4DFixAction.COMMAND,
                reason: 'unified_diff_cannot_be_shown'
            }
        });
    });

    it('When diagnostic is not relevant (i.e. null is returned from suggestFix), then return with info msg displayed', async () => {
        const staleDiagnostic: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(0,0,0,1), 'ApexDoc');
        staleDiagnostic.markStale();

        await a4dFixAction.run(staleDiagnostic, sampleDocument);

        expect(display.displayInfoCallHistory).toHaveLength(1);
        expect(display.displayInfoCallHistory[0].msg).toEqual(messages.fixer.noFixSuggested);
        expect(unifiedDiffService.showDiffCallHistory).toHaveLength(0);
        expect(diagnosticCollection.get(sampleUri)).toHaveLength(2); // Should still be 2
        
        // Telemetry event is sent
        expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
        expect(telemetryService.sendCommandEventCallHistory[0]).toEqual({
            commandName: 'sfdx__codeanalyzer_qf_no_fix_suggested',
            properties: {
                commandSource: A4DFixAction.COMMAND,
                languageType: 'apex',
                reason: 'empty'
            }
        });
    });

    it('When error is thrown from the LLMServiceProvider, then display error message and send exception telemetry event', async () => {
        llmServiceProvider = new stubs.ThrowingLLMServiceProvider();
        a4dFixAction = new A4DFixAction(llmServiceProvider, codeAnalyzer, unifiedDiffService, diagnosticManager, telemetryService, logger, display);

        await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);

        expect(display.displayErrorCallHistory).toHaveLength(1);
        expect(display.displayErrorCallHistory[0].msg).toContain('Error from getLLMService');

        expect(telemetryService.sendExceptionCallHistory).toHaveLength(1);
        expect(telemetryService.sendExceptionCallHistory[0].errorMessage).toContain(
            'Error from getLLMService');
        expect(telemetryService.sendExceptionCallHistory[0].name).toEqual(
            'sfdx__eGPT_suggest_failure');
        expect(telemetryService.sendExceptionCallHistory[0].properties['executedCommand']).toEqual(
            A4DFixAction.COMMAND);
    });

    it('When error is thrown while suggesting fix, then display error message and send exception telemetry event', async () => {
        llmServiceProvider = new stubs.StubLLMServiceProvider(new stubs.ThrowingLLMService());
        a4dFixAction = new A4DFixAction(llmServiceProvider, codeAnalyzer, unifiedDiffService, diagnosticManager, telemetryService, logger, display);

        await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);

        expect(display.displayErrorCallHistory).toHaveLength(1);
        expect(display.displayErrorCallHistory[0].msg).toContain('Error from callLLM');

        expect(telemetryService.sendExceptionCallHistory).toHaveLength(1);
        expect(telemetryService.sendExceptionCallHistory[0].errorMessage).toContain(
            'Error from callLLM');
        expect(telemetryService.sendExceptionCallHistory[0].name).toEqual(
            'sfdx__eGPT_suggest_failure');
        expect(telemetryService.sendExceptionCallHistory[0].properties['executedCommand']).toEqual(
            A4DFixAction.COMMAND);
    });

    it('When error is thrown from Code Analyzer, then display error message and send exception telemetry event', async () => {
        const throwingCodeAnalyzer: CodeAnalyzer = new stubs.ThrowingCodeAnalyzer();
        a4dFixAction = new A4DFixAction(llmServiceProvider, throwingCodeAnalyzer, unifiedDiffService, diagnosticManager, telemetryService, logger, display);

        await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);

        expect(display.displayErrorCallHistory).toHaveLength(1);
        expect(display.displayErrorCallHistory[0].msg).toContain('Error from getRuleDescriptionFor.');

        expect(telemetryService.sendExceptionCallHistory).toHaveLength(1);
        expect(telemetryService.sendExceptionCallHistory[0].errorMessage).toContain(
            'Error from getRuleDescriptionFor.');
        expect(telemetryService.sendExceptionCallHistory[0].name).toEqual(
            'sfdx__eGPT_suggest_failure');
        expect(telemetryService.sendExceptionCallHistory[0].properties['executedCommand']).toEqual(
            A4DFixAction.COMMAND);
    });

    it('When llm response does not contain fixedCode field, then display error message and send exception telemetry event', async () => {
        spyLLMService.callLLMReturnValue = '{"useless":3}';
        await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);

        expect(display.displayErrorCallHistory).toHaveLength(1);
        expect(display.displayErrorCallHistory[0].msg).toContain(`Response from LLM is missing the 'fixedCode' property.`);

        expect(telemetryService.sendExceptionCallHistory).toHaveLength(1);
        expect(telemetryService.sendExceptionCallHistory[0].errorMessage).toContain(
            `Response from LLM is missing the 'fixedCode' property.`);
        expect(telemetryService.sendExceptionCallHistory[0].name).toEqual(
            'sfdx__eGPT_suggest_failure');
        expect(telemetryService.sendExceptionCallHistory[0].properties['executedCommand']).toEqual(
            A4DFixAction.COMMAND);
    });

    describe('JSON parsing positive tests', () => {
        it('When llm response has JSON with only fixedCode field (explanation is optional), then fix is suggested successfully', async () => {
            spyLLMService.callLLMReturnValue = '{"fixedCode": "test code"}';
            
            await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);

            expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
            expect(unifiedDiffService.showDiffCallHistory[0].newCode).toContain('test code');
            expect(display.displayInfoCallHistory).toHaveLength(0); // No explanation provided
        });

        it('When llm response has JSON with additional fields but still has a fixedCode field, then fix is suggested successfully', async () => {
            spyLLMService.callLLMReturnValue = '{"fixedCode": "test code", "additionalField": "additional value"}';
            
            await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);

            expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
            expect(unifiedDiffService.showDiffCallHistory[0].newCode).toContain('test code');
            expect(display.displayInfoCallHistory).toHaveLength(0); // No explanation provided
        });

        it('When llm response is JSON in markdown code blocks with json language specifier, then fix is suggested successfully', async () => {
            spyLLMService.callLLMReturnValue = '```json\n{"fixedCode": "fixed code", "explanation": "explanation"}\n```';
            
            await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);

            expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
            expect(unifiedDiffService.showDiffCallHistory[0].newCode).toContain('fixed code');
            expect(display.displayInfoCallHistory).toHaveLength(1);
            expect(display.displayInfoCallHistory[0].msg).toEqual('Fix Explanation: explanation');
        });

        it('When llm response is JSON in markdown code blocks without language specifier, then fix is suggested successfully', async () => {
            spyLLMService.callLLMReturnValue = '```\n{"fixedCode": "fixed code", "explanation": "explanation"}\n```';
            
            await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);

            expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
            expect(unifiedDiffService.showDiffCallHistory[0].newCode).toContain('fixed code');
            expect(display.displayInfoCallHistory).toHaveLength(1);
            expect(display.displayInfoCallHistory[0].msg).toEqual('Fix Explanation: explanation');
        });

        it('When llm response has extra text before JSON (like "apist"), then fix is suggested successfully', async () => {
            spyLLMService.callLLMReturnValue = 'apist\n{\n  "explanation": "Added ApexDoc comment to the class",\n  "fixedCode": "/**\\n * This class demonstrates bad practices.\\n */\\npublic class Test {}"\n}';
            
            await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);

            expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
            expect(unifiedDiffService.showDiffCallHistory[0].newCode).toContain('This class demonstrates bad practices');
            expect(display.displayInfoCallHistory).toHaveLength(1);
            expect(display.displayInfoCallHistory[0].msg).toEqual('Fix Explanation: Added ApexDoc comment to the class');
        });

        it('When llm response has extra text before and after JSON, then fix is suggested successfully', async () => {
            spyLLMService.callLLMReturnValue = 'some extra text here{"fixedCode": "test code", "explanation": "test explanation"}\nsome extra text here';
            
            await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);

            expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
            expect(unifiedDiffService.showDiffCallHistory[0].newCode).toContain('test code');
            expect(display.displayInfoCallHistory).toHaveLength(1);
            expect(display.displayInfoCallHistory[0].msg).toEqual('Fix Explanation: test explanation');
        });

        it('When llm response is JSON wrapped in single quotes and markdown, then fix is suggested successfully', async () => {
            const complexResponse = `' \`\`\`json{  "explanation": "Added ApexDoc comment to the class to satisfy the ApexDoc rule requirement for public classes.",  "fixedCode": "/**\\\\n * This class demonstrates bad cryptographic practices.\\\\n */\\\\npublic without sharing class ApexBadCrypto {\\\\n    Blob hardCodedIV = Blob.valueOf('Hardcoded IV 123');\\\\n    Blob hardCodedKey = Blob.valueOf('0000000000000000');\\\\n    Blob data = Blob.valueOf('Data to be encrypted');\\\\n    Blob encrypted = Crypto.encrypt('AES128', hardCodedKey, hardCodedIV, data);\\\\n}"}\`\`\`'`;
            spyLLMService.callLLMReturnValue = complexResponse;
            
            await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);

            expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
            expect(unifiedDiffService.showDiffCallHistory[0].newCode).toContain('public without sharing class ApexBadCrypto');
            expect(display.displayInfoCallHistory).toHaveLength(1);
            expect(display.displayInfoCallHistory[0].msg).toEqual('Fix Explanation: Added ApexDoc comment to the class to satisfy the ApexDoc rule requirement for public classes.');
        });

        it('When llm response has leading whitespace and newlines, then fix is suggested successfully', async () => {
            spyLLMService.callLLMReturnValue = '\n\n   \n{"fixedCode": "test code", "explanation": "test explanation"}   \n\n';
            
            await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);

            expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
            expect(unifiedDiffService.showDiffCallHistory[0].newCode).toContain('test code');
            expect(display.displayInfoCallHistory).toHaveLength(1);
            expect(display.displayInfoCallHistory[0].msg).toEqual('Fix Explanation: test explanation');
        });

        it('When llm response has JSON with nested braces and trailing content, then fix is suggested successfully', async () => {
            spyLLMService.callLLMReturnValue = '{"fixedCode": "code with {nested} braces", "explanation": "test explanation"} and trailing text here';
            
            await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);
            
            expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
            expect(unifiedDiffService.showDiffCallHistory[0].newCode).toContain('code with {nested} braces');
            expect(display.displayInfoCallHistory).toHaveLength(1);
            expect(display.displayInfoCallHistory[0].msg).toEqual('Fix Explanation: test explanation');
        });
    });
    describe('JSON parsing negative tests', () => {
        it.each([
            //no JSON at all
            'This is just plain text with no JSON at all',
            //multiple JSON objects with text between them
            '{"wrong": "object"} some text {"fixedCode": "test code", "explanation": "test explanation"} more text',
            //JSON with missing opening brace
            '"fixedCode": "test code", "explanation": "test explanation"}',
            //JSON with missing closing brace
            '{"fixedCode": "test code", "explanation": "test explanation"',
            //JSON with missing quote and brace
            '{"fixedCode": "test code", "explanation": "missing closing quote and brace',
        ])('When llm response is not valid, then display error message and send exception telemetry event', async (response: string) => {
            spyLLMService.callLLMReturnValue = response;
            await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);

            expect(display.displayErrorCallHistory).toHaveLength(1);
            expect(display.displayErrorCallHistory[0].msg).toContain('Response from LLM');
            expect(telemetryService.sendExceptionCallHistory).toHaveLength(1);
            expect(telemetryService.sendExceptionCallHistory[0].errorMessage).toContain('Unable to extract valid JSON from response');

            expect(telemetryService.sendExceptionCallHistory).toHaveLength(1);
            expect(telemetryService.sendExceptionCallHistory[0].errorMessage).toContain(
                `Response from LLM is not valid JSON`);
            expect(telemetryService.sendExceptionCallHistory[0].name).toEqual(
                'sfdx__eGPT_suggest_failure');
            expect(telemetryService.sendExceptionCallHistory[0].properties['executedCommand']).toEqual(
                A4DFixAction.COMMAND);
        });
    });

    it('When fix is suggested, then the diff is displayed, the diagnostic is cleared, and a telemetry event is sent', async () => {
        await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);

        // Diff is displayed
        expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
        expect(unifiedDiffService.showDiffCallHistory[0].document).toEqual(sampleDocument);
        // expect the first line to get replaced by the fix
        expect(unifiedDiffService.showDiffCallHistory[0].newCode).toEqual(
            'some code fix\n' +         // < ---expect the first line to get replaced by the fix
            'that is multi-line\n' +
            '  with spaces and such\n' +
            '  within the content.');

        // Diagnostic is cleared
        expect(diagnosticCollection.get(sampleUri)).toEqual([ // sampleDiagForSingleLine should be removed
            sampleDiagThatSpansTwoLines // but sampleDiagThatSpansTwoLines should still remain
        ]);

        // Telemetry event is sent
        expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
        expect(telemetryService.sendCommandEventCallHistory[0]).toEqual({
            commandName: 'sfdx__eGPT_suggest',
            properties: {
                commandSource: A4DFixAction.COMMAND,
                completionNumLines: '1',
                languageType: 'apex',
                engineName: 'pmd',
                ruleName: 'ApexAssertionsShouldIncludeMessage'
            }
        });
    });

    it('When fix is suggested with an explanation, then diff is displayed and explanation is given by an info message display', async () => {
        spyLLMService.callLLMReturnValue = '{"fixedCode": "hello World", "explanation": "This is some explanation"}';

        await a4dFixAction.run(sampleDiagThatSpansTwoLines, sampleDocument);

        // Diff is displayed
        expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
        expect(unifiedDiffService.showDiffCallHistory[0].document).toEqual(sampleDocument);
        expect(unifiedDiffService.showDiffCallHistory[0].newCode).toEqual(
            'This is some dummy content\n' +
            'hello World\n' + // Fix replaces both lines
            '  within the content.');

        expect(display.displayInfoCallHistory).toHaveLength(1);
        expect(display.displayInfoCallHistory[0].msg).toEqual('Fix Explanation: This is some explanation');

    });

    it('When fix is suggested, then the accept callback (when executed) sends a telemetry event', async () => {
        await a4dFixAction.run(sampleDiagThatSpansTwoLines, sampleDocument);

        expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
        await unifiedDiffService.showDiffCallHistory[0].acceptCallback();

        expect(telemetryService.sendCommandEventCallHistory).toHaveLength(2);
        expect(telemetryService.sendCommandEventCallHistory[1]).toEqual({
            commandName: 'sfdx__eGPT_accept',
            properties: {
                commandSource: A4DFixAction.COMMAND,
                completionNumLines: '1',
                languageType: 'apex',
                engineName: 'pmd',
                ruleName: 'UnusedLocalVariable'
            }
        });
    });

    it('When fix is suggested, then the reject callback (when executed) sends a telemetry event', async () => {
        await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);

        expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
        await unifiedDiffService.showDiffCallHistory[0].rejectCallback();

        expect(telemetryService.sendCommandEventCallHistory).toHaveLength(2);
        expect(telemetryService.sendCommandEventCallHistory[1]).toEqual({
            commandName: 'sfdx__eGPT_clear',
            properties: {
                commandSource: A4DFixAction.COMMAND,
                completionNumLines: '1',
                languageType: 'apex',
                engineName: 'pmd',
                ruleName: 'ApexAssertionsShouldIncludeMessage'
            }
        });
    });

    it('When fix is suggested, but diff tool throws exception, then display error message, restore diagnostic, and send exception telemetry event', async () => {
        const unifiedDiffService: stubs.ThrowingUnifiedDiffService = new stubs.ThrowingUnifiedDiffService();
        a4dFixAction = new A4DFixAction(llmServiceProvider, codeAnalyzer, unifiedDiffService, diagnosticManager, telemetryService, logger, display);

        await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);

        expect(display.displayErrorCallHistory).toHaveLength(1);
        expect(display.displayErrorCallHistory[0].msg).toContain('Error thrown from: showDiff');

        expect(telemetryService.sendExceptionCallHistory).toHaveLength(1);
        expect(telemetryService.sendExceptionCallHistory[0].errorMessage).toContain(
            'Error thrown from: showDiff');
        expect(telemetryService.sendExceptionCallHistory[0].name).toEqual(
            'sfdx__eGPT_suggest_failure');
        expect(telemetryService.sendExceptionCallHistory[0].properties['executedCommand']).toEqual(
            A4DFixAction.COMMAND);

        expect(diagnosticCollection.get(sampleUri)).toHaveLength(2); // Should still be 2
    });

    it('When fix suggested is exactly the same as the original code, then show info message saying that no fix was suggested', async () => {
        // this fixed code is exactly the same as lines 2 and 3 - which sampleDiagThatSpansTwoLines's range gets extended to
        spyLLMService.callLLMReturnValue = '{"fixedCode": "that is multi-line\\n  with spaces and such"}';
        await a4dFixAction.run(sampleDiagThatSpansTwoLines, sampleDocument);

        expect(display.displayInfoCallHistory).toHaveLength(1);
        expect(display.displayInfoCallHistory[0].msg).toEqual(messages.fixer.noFixSuggested);
        expect(unifiedDiffService.showDiffCallHistory).toHaveLength(0);
        expect(diagnosticCollection.get(sampleUri)).toHaveLength(2); // Should still be 2

        // Telemetry event is sent
        expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
        expect(telemetryService.sendCommandEventCallHistory[0]).toEqual({
            commandName: 'sfdx__codeanalyzer_qf_no_fix_suggested',
            properties: {
                commandSource: A4DFixAction.COMMAND,
                languageType: 'apex',
                reason: 'same_code'
            }
        });
    });

    it('When codeAnalyzer returns description, then it is forwarded to the LLMService', async () => {
        codeAnalyzer.getRuleDescriptionForReturnValue = 'some rule description';
        await a4dFixAction.run(sampleDiagForSingleLine, sampleDocument);
        expect(spyLLMService.callLLMCallHistory).toHaveLength(1);
        expect(spyLLMService.callLLMCallHistory[0].prompt).toContain('"ruleDescription": "some rule description"');
    });

    it('When a rule should be sending in the full method context, confirm the context gets sent and the full method gets replaced', async () => {
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
            new vscode.Range(5, 50, 5, 62), 'ApexBadCrypto'); // Uses MethodScope

        spyLLMService.callLLMReturnValue = '{"fixedCode": "some replacement\\ncode here"}';

        await a4dFixAction.run(diagnostic, document);

        expect(spyLLMService.callLLMCallHistory[0].prompt).toContain('"codeContext": "    public void someMethod() {');

        // Diff is displayed
        expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
        expect(unifiedDiffService.showDiffCallHistory[0].document).toEqual(document);
        // expect the first line to get replaced by the fix
        expect(unifiedDiffService.showDiffCallHistory[0].newCode).toEqual(
            'public class SomeClass {\n' +
            '    some replacement\n' + // < --- fix replaced entire method block
            '    code here\n' +        // <-- And notice the proper indenting!
            '}');

        // Telemetry event is sent
        expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
        expect(telemetryService.sendCommandEventCallHistory[0]).toEqual({
            commandName: 'sfdx__eGPT_suggest',
            properties: {
                commandSource: A4DFixAction.COMMAND,
                completionNumLines: '2',
                languageType: 'apex',
                engineName: 'pmd',
                ruleName: 'ApexBadCrypto'
            }
        });
    })

    it('When a rule should be sending in the full class context, confirm the context gets sent and the full class gets replaced', async () => {
        const fileContent: string =
            '// This is some comment\n' +
            'public class FieldDeclarationsShouldBeAtStart {\n' +
            '    public Integer instanceProperty { get; set; }\n' +
            '\n' +
            '    public void someMethod() {\n' +
            '    }\n' +
            '\n' + 
            '    public Integer anotherField; // bad\n' + 
            '}';
        const document: vscode.TextDocument = createTextDocument(vscode.Uri.file('dummy.cls'), fileContent, 'apex');
        const diagnostic: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(vscode.Uri.file('dummy.cls'),
            new vscode.Range(7, 4, 7, 31), 'FieldDeclarationsShouldBeAtStart'); // Uses ClassScope

        spyLLMService.callLLMReturnValue = '{"fixedCode": "some replacement\\ncode here"}';

        await a4dFixAction.run(diagnostic, document);

        expect(spyLLMService.callLLMCallHistory[0].prompt).toContain('"codeContext": "public class FieldDeclarationsShouldBeAtStart');

        // Diff is displayed
        expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
        expect(unifiedDiffService.showDiffCallHistory[0].document).toEqual(document);
        // expect the first line to get replaced by the fix
        expect(unifiedDiffService.showDiffCallHistory[0].newCode).toEqual(
            '// This is some comment\n' +
            'some replacement\n' + // < --- fix replaced entire class block
            'code here');

        // Telemetry event is sent
        expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
        expect(telemetryService.sendCommandEventCallHistory[0]).toEqual({
            commandName: 'sfdx__eGPT_suggest',
            properties: {
                commandSource: A4DFixAction.COMMAND,
                completionNumLines: '2',
                languageType: 'apex',
                engineName: 'pmd',
                ruleName: 'FieldDeclarationsShouldBeAtStart'
            }
        });
    });
});