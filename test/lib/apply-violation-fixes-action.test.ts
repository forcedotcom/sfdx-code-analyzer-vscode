import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts

import * as stubs from "../stubs";
import { createTextDocument } from "jest-mock-vscode";
import { createSampleViolation } from "../test-utils";
import { CodeAnalyzerDiagnostic, DiagnosticFactory, DiagnosticManager, DiagnosticManagerImpl } from "../../src/lib/diagnostics";
import { FakeDiagnosticCollection } from "../vscode-stubs";
import { ApplyViolationFixesAction } from "../../src/lib/apply-violation-fixes-action";
import { messages } from "../../src/lib/messages";


describe('Tests for ApplyViolationFixesAction', () => {
    const sampleUri: vscode.Uri = vscode.Uri.file('/someFile.cls');
    const sampleContent: string = 
        `public class ConsolidatedClass {\n` +
        `    public static void processAccountsAndContacts(List<Account> accounts) {\n` +
        `        // Antipattern [Avoid using Schema.getGlobalDescribe() in Apex]:  (has fix)\n` +
        `        Schema.DescribeSObjectResult opportunityDescribe = Schema.getGlobalDescribe().get('Opportunity').getDescribe();\n` +
        `        System.debug('Opportunity Describe: ' + opportunityDescribe);\n` +
        `\n` +
        `        for (Account acc : accounts) {\n` +
        `            // Antipattern [SOQL in loop]:\n` +
        `            List<Contact> contacts = [SELECT Id, Email FROM Contact WHERE AccountId = :acc.Id];\n` +
        `            System.debug('Contacts: ' + contacts);\n` +
        `        }\n` +
        `}`;

    const sampleDocument: vscode.TextDocument = createTextDocument(sampleUri, sampleContent, 'apex');
    const testDiagnosticFactory = new DiagnosticFactory(new stubs.StubSettingsManager());
    const sampleDiag1: CodeAnalyzerDiagnostic = testDiagnosticFactory.fromViolation(createSampleViolation(
        { file: sampleUri.fsPath, startLine: 4 }, 'AvoidUsingSchemaGetGlobalDescribe', 'apexguru', // Note that these rule names are made up right now
        [{ 
            location: { file: sampleUri.fsPath, startLine: 4, startColumn: 9 },
            fixedCode: 'Schema.DescribeSObjectResult opportunityDescribe = Opportunity.sObjectType.getDescribe();'
        }]
    ));
    if (!sampleDiag1) throw new Error('Failed to create sampleDiag1');
    const sampleDiag2: CodeAnalyzerDiagnostic = testDiagnosticFactory.fromViolation(createSampleViolation( // not relevant because it has no fixes
        { file: sampleUri.fsPath, startLine: 9 }, 'AvoidSOQLInLoop', 'apexguru'
    ));

    let unifiedDiffService: stubs.SpyUnifiedDiffService;
    let diagnosticCollection: vscode.DiagnosticCollection;
    let diagnosticManager: DiagnosticManager;
    let telemetryService: stubs.SpyTelemetryService;
    let logger: stubs.SpyLogger;
    let display: stubs.SpyDisplay;
    let applyViolationFixesAction: ApplyViolationFixesAction;

    beforeEach(() => {
        unifiedDiffService = new stubs.SpyUnifiedDiffService();
        diagnosticCollection = new FakeDiagnosticCollection();
        if (!sampleDiag1 || !sampleDiag2) throw new Error('Failed to create sample diagnostics');
        diagnosticCollection.set(sampleUri, [sampleDiag1, sampleDiag2]);
        diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection, new stubs.StubSettingsManager());
        telemetryService = new stubs.SpyTelemetryService();
        logger = new stubs.SpyLogger();
        display = new stubs.SpyDisplay();
        applyViolationFixesAction = new ApplyViolationFixesAction(unifiedDiffService, diagnosticManager, telemetryService, logger, display);
    });

    it('When unified diff service cannot show diff, then return without trying to show diff', async () => {
        unifiedDiffService.verifyCanShowDiffReturnValue = false;

        await applyViolationFixesAction.run(sampleDiag1, sampleDocument);

        expect(display.displayWarningCallHistory).toHaveLength(0);
        expect(unifiedDiffService.showDiffCallHistory).toHaveLength(0);

        // Telemetry event is sent
        expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
        expect(telemetryService.sendCommandEventCallHistory[0]).toEqual({
            commandName: 'sfdx__codeanalyzer_qf_no_fix_suggested',
            properties: {
                commandSource: ApplyViolationFixesAction.COMMAND,
                reason: 'unified_diff_cannot_be_shown'
            }
        });
    });

    it('When diagnostic is not relevant (i.e. null is returned from suggestFix), then return with info msg displayed', async () => {
        await applyViolationFixesAction.run(sampleDiag2, sampleDocument); // sampleDiag2 is not relevant

        expect(display.displayInfoCallHistory).toHaveLength(1);
        expect(display.displayInfoCallHistory[0].msg).toEqual(messages.fixer.noFixSuggested);
        expect(unifiedDiffService.showDiffCallHistory).toHaveLength(0);
        expect(diagnosticCollection.get(sampleUri)).toHaveLength(2); // Should still be 2
        
        // Telemetry event is sent
        expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
        expect(telemetryService.sendCommandEventCallHistory[0]).toEqual({
            commandName: 'sfdx__codeanalyzer_qf_no_fix_suggested',
            properties: {
                commandSource: ApplyViolationFixesAction.COMMAND,
                languageType: 'apex',
                reason: 'empty'
            }
        });
    });

    it('When fix is suggested, then the diff is displayed, the diagnostic is cleared, and a telemetry event is sent', async () => {
        await applyViolationFixesAction.run(sampleDiag1, sampleDocument);

        // Diff is displayed
        expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
        expect(unifiedDiffService.showDiffCallHistory[0].document).toEqual(sampleDocument);
        // expect the line to get replaced by the fix correctly
        expect(unifiedDiffService.showDiffCallHistory[0].newCode).toEqual(
            sampleContent.replace(
                `Schema.DescribeSObjectResult opportunityDescribe = Schema.getGlobalDescribe().get('Opportunity').getDescribe();`,
                `Schema.DescribeSObjectResult opportunityDescribe = Opportunity.sObjectType.getDescribe();`
            ));

        // Diagnostic is cleared
        expect(diagnosticCollection.get(sampleUri)).toEqual([ // sampleDiag1 should be removed
            sampleDiag2 // but sampleDiag2 should still remain
        ]);

        // Telemetry event is sent
        expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
        expect(telemetryService.sendCommandEventCallHistory[0]).toEqual({
            commandName: 'sfdx__codeanalyzer_qf_fix_suggested',
            properties: {
                commandSource: ApplyViolationFixesAction.COMMAND,
                completionNumLines: '1',
                languageType: 'apex',
                engineName: 'apexguru',
                ruleName: 'AvoidUsingSchemaGetGlobalDescribe'
            }
        });
    });

    it('When fix is suggested, then the accept callback (when executed) sends a telemetry event', async () => {
        await applyViolationFixesAction.run(sampleDiag1, sampleDocument);

        expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
        await unifiedDiffService.showDiffCallHistory[0].acceptCallback();

        expect(telemetryService.sendCommandEventCallHistory).toHaveLength(2);
        expect(telemetryService.sendCommandEventCallHistory[1]).toEqual({
            commandName: 'sfdx__codeanalyzer_qf_fix_accepted',
            properties: {
                commandSource: ApplyViolationFixesAction.COMMAND,
                completionNumLines: '1',
                languageType: 'apex',
                engineName: 'apexguru',
                ruleName: 'AvoidUsingSchemaGetGlobalDescribe'
            }
        });
    });

    it('When fix is suggested, then the reject callback (when executed) sends a telemetry event', async () => {
        await applyViolationFixesAction.run(sampleDiag1, sampleDocument);

        expect(unifiedDiffService.showDiffCallHistory).toHaveLength(1);
        await unifiedDiffService.showDiffCallHistory[0].rejectCallback();

        expect(telemetryService.sendCommandEventCallHistory).toHaveLength(2);
        expect(telemetryService.sendCommandEventCallHistory[1]).toEqual({
            commandName: 'sfdx__codeanalyzer_qf_fix_rejected',
            properties: {
                commandSource: ApplyViolationFixesAction.COMMAND,
                completionNumLines: '1',
                languageType: 'apex',
                engineName: 'apexguru',
                ruleName: 'AvoidUsingSchemaGetGlobalDescribe'
            }
        });
    });

    it('When fix is suggested, but diff tool throws exception, then display error message, restore diagnostic, and send exception telemetry event', async () => {
        const unifiedDiffService: stubs.ThrowingUnifiedDiffService = new stubs.ThrowingUnifiedDiffService();
        applyViolationFixesAction = new ApplyViolationFixesAction(unifiedDiffService, diagnosticManager, telemetryService, logger, display);

        await applyViolationFixesAction.run(sampleDiag1, sampleDocument);

        expect(display.displayErrorCallHistory).toHaveLength(1);
        expect(display.displayErrorCallHistory[0].msg).toContain('Error thrown from: showDiff');

        expect(telemetryService.sendExceptionCallHistory).toHaveLength(1);
        expect(telemetryService.sendExceptionCallHistory[0].errorMessage).toContain(
            'Error thrown from: showDiff');
        expect(telemetryService.sendExceptionCallHistory[0].name).toEqual(
            'sfdx__codeanalyzer_qf_fix_suggestion_failed');
        expect(telemetryService.sendExceptionCallHistory[0].properties['executedCommand']).toEqual(
            ApplyViolationFixesAction.COMMAND);

        expect(diagnosticCollection.get(sampleUri)).toHaveLength(2); // Should still be 2
    });

    it('When fix suggested is exactly the same as the original code, then show info message saying that no fix was suggested', async () => {
        // this fixed code is exactly the same as lines 2 and 3 - which sampleDiagThatSpansTwoLines's range gets extended to
        if (!sampleDiag2) throw new Error('Failed to create sampleDiag2');
        const diag: CodeAnalyzerDiagnostic = testDiagnosticFactory.fromViolation(createSampleViolation(
            { file: sampleUri.fsPath, startLine: 1, endLine: 5 }, 'SomeRuleName', 'SomeEngine',
            [{ 
                location: { file: sampleUri.fsPath, startLine: 1, startColumn: 8, endColumn: 13  },
                fixedCode: 'class' // exact same code
            }]
        ))
        await applyViolationFixesAction.run(diag, sampleDocument);

        expect(display.displayInfoCallHistory).toHaveLength(1);
        expect(display.displayInfoCallHistory[0].msg).toEqual(messages.fixer.noFixSuggested);
        expect(unifiedDiffService.showDiffCallHistory).toHaveLength(0);
        expect(diagnosticCollection.get(sampleUri)).toHaveLength(2); // Should still be 2

        // Telemetry event is sent
        expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
        expect(telemetryService.sendCommandEventCallHistory[0]).toEqual({
            commandName: 'sfdx__codeanalyzer_qf_no_fix_suggested',
            properties: {
                commandSource: ApplyViolationFixesAction.COMMAND,
                languageType: 'apex',
                reason: 'same_code'
            }
        });
    });
});

