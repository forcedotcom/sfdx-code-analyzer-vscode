import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts
import { createSampleViolation } from '../test-utils';
import { createTextDocument } from "jest-mock-vscode";
import { StubCodeActionContext } from "../vscode-stubs";
import { ApplyViolationFixesAction } from "../../../lib/apply-violation-fixes-action";
import { ApplyViolationFixesActionProvider } from "../../../lib/apply-violation-fixes-action-provider";
import { CodeAnalyzerDiagnostic } from "../../../lib/diagnostics";

describe('ApplyViolationFixesActionProvider Tests', () => {
    let actionProvider: ApplyViolationFixesActionProvider;

    beforeEach(() => {
        actionProvider = new ApplyViolationFixesActionProvider();
    });

    describe('provideCodeActions Tests', () => {
        const sampleApexUri: vscode.Uri = vscode.Uri.file('/someFile.cls');
        const sampleApexContent: string = 
            `public class ConsolidatedClass {\n` +
            `    public static void processAccountsAndContacts(List<Account> accounts) {\n` +
            `        // Antipattern [Avoid using Schema.getGlobalDescribe() in Apex]:  (has fix)\n` +
            `        Schema.DescribeSObjectResult opportunityDescribe = Schema.getGlobalDescribe().get('Opportunity').getDescribe();\n` +
            `        System.debug('Opportunity Describe: ' + opportunityDescribe);\n` +
            `\n` +
            `        for (Account acc : accounts) {\n` +
            `            // Antipattern [SOQL in loop]:\n` +
            `            List<Contact> contacts = [SELECT Id, Email FROM Contact WHERE AccountId = :acc.Id];\n` +
            `            for (Contact con : contacts) {\n` +
            `                con.Email = 'newemail@example.com';\n` +
            `                // Antipattern [DML in loop]:\n` +
            `                update con;\n` +
            `            }\n` +
            `        }\n` +
            `\n` +
            `        // Antipattern [SOQL with negative expression]:\n` +
            `        List<Contact> contactsNotInUS = [SELECT Id, FirstName, LastName FROM Contact WHERE MailingCountry != 'US'];\n` +
            `        System.debug('Contacts not in US: ' + contactsNotInUS);\n` +
            `\n` +
            `        // Antipattern [SOQL without WHERE clause or LIMIT]:\n` +
            `        List<Account> allAccounts = [SELECT Id, Name FROM Account];\n` +
            `        System.debug('All Accounts: ' + allAccounts);\n` +
            `\n` +
            `        // Antipattern [Using a list of SObjects for an IN-bind to ID in a SOQL]:  (has suggestion)\n` +
            `        List<Contact> contactsFromAccounts = [SELECT Id, FirstName, LastName FROM Contact WHERE AccountId IN :accounts];\n` +
            `        System.debug('Contacts from Accounts: ' + contactsFromAccounts);\n` +
            `\n` +
            `        // Antipattern [SOQL with wildcard filters]:\n` +
            `        List<Account> accountsWithWildcard = [SELECT Id, Name FROM Account WHERE Name LIKE '%Corp%'];\n` +
            `        System.debug('Accounts with wildcard: ' + accountsWithWildcard);\n` +
            `    }\n` +
            `}`;

        const sampleApexDocument: vscode.TextDocument = createTextDocument(sampleApexUri, sampleApexContent, 'apex');
        const sampleDiag1: vscode.Diagnostic = CodeAnalyzerDiagnostic.fromViolation(createSampleViolation(
            { file: sampleApexUri.fsPath, startLine: 4 }, 'AvoidUsingSchemaGetGlobalDescribe', 'apexguru', // Note that these rule names are made up right now
            [{ 
                location: { file: sampleApexUri.fsPath, startLine: 4, startColumn: 9 },
                fixedCode: 'Schema.DescribeSObjectResult opportunityDescribe = Opportunity.sObjectType.getDescribe()'
            }]
        ))
        const sampleDiag2: vscode.Diagnostic = CodeAnalyzerDiagnostic.fromViolation(createSampleViolation(
            { file: sampleApexUri.fsPath, startLine: 9 }, 'AvoidSOQLInLoop', 'apexguru'
        ))
        const sampleDiag3: vscode.Diagnostic = CodeAnalyzerDiagnostic.fromViolation(createSampleViolation(
            { file: sampleApexUri.fsPath, startLine: 13 }, 'AvoidDMLInLoop', 'apexguru'
        ))
        const sampleDiag4: vscode.Diagnostic = CodeAnalyzerDiagnostic.fromViolation(createSampleViolation(
            { file: sampleApexUri.fsPath, startLine: 18 }, 'AvoidSOQLWithNegativeExpression', 'apexguru'
        ))
        const sampleDiag5: vscode.Diagnostic = CodeAnalyzerDiagnostic.fromViolation(createSampleViolation(
            { file: sampleApexUri.fsPath, startLine: 22 }, 'AvoidSOQLWithoutWhereClauseOrLimit', 'apexguru'
        ))
        const sampleDiag6: vscode.Diagnostic = CodeAnalyzerDiagnostic.fromViolation(createSampleViolation(
            { file: sampleApexUri.fsPath, startLine: 26 }, 'AvoidUsingSObjectsToInBind', 'apexguru',
            [{ 
                location: { file: sampleApexUri.fsPath, startLine: 26 },
                fixedCode: `Map<Id, Account> accountsMap = new Map<Id, Account>(accounts);\n` +
                    `//Inside the SOQL: convert "accounts" into "accountsMap.keySet()"`
            }]

        ))
        const sampleDiag7: vscode.Diagnostic = CodeAnalyzerDiagnostic.fromViolation(createSampleViolation(
            { file: sampleApexUri.fsPath, startLine: 30 }, 'AvoidSOQLWithWildcardFilters', 'apexguru'
        ))


        // TODO: This test is temporary (as it is tied to the apex guru pilot code) and will be generalized soon.
        it('When selected range contains the entire document, only actions for diagnostics with apex guru suggestions are returned', () => {
            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [
                sampleDiag1, sampleDiag2, sampleDiag3, sampleDiag4, sampleDiag5, sampleDiag6, sampleDiag7]});
            const selectedRange: vscode.Range = new vscode.Range(0, 0, sampleApexDocument.lineCount, 0); // select the whole file
            const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(sampleApexDocument, selectedRange, context);

            // We should only get 2 code actions
            expect(codeActions).toHaveLength(2);

            // Validate the first one is associated with diag 1
            expect(codeActions[0].title).toEqual("Apply fix for 'AvoidUsingSchemaGetGlobalDescribe' from 'apexguru'");
            expect(codeActions[0].diagnostics).toEqual([sampleDiag1]);
            expect(codeActions[0].command.command).toEqual(ApplyViolationFixesAction.COMMAND);
            expect(codeActions[0].command.arguments).toEqual([sampleDiag1, sampleApexDocument])


            // Validate the second is associated with diag 6
            expect(codeActions[1].title).toEqual("Apply fix for 'AvoidUsingSObjectsToInBind' from 'apexguru'");
            expect(codeActions[1].diagnostics).toEqual([sampleDiag6]);
            expect(codeActions[1].command.command).toEqual(ApplyViolationFixesAction.COMMAND);
            expect(codeActions[1].command.arguments).toEqual([sampleDiag6, sampleApexDocument]);
        });

        it('stale diagnostics are filtered out', () => {
            const staleDiag: CodeAnalyzerDiagnostic = CodeAnalyzerDiagnostic.fromViolation(createSampleViolation(
                { file: sampleApexUri.fsPath, startLine: 4 }, 'AvoidUsingSchemaGetGlobalDescribe', 'apexguru',
                [{ 
                    location: { file: sampleApexUri.fsPath, startLine: 4, startColumn: 9 },
                    fixedCode: 'Schema.DescribeSObjectResult opportunityDescribe = Opportunity.sObjectType.getDescribe()'
                }]
            ));
            staleDiag.markStale();

            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [sampleDiag1, staleDiag]});
            const selectedRange: vscode.Range = new vscode.Range(0, 0, sampleApexDocument.lineCount, 0); // select the whole file

            const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(sampleApexDocument, selectedRange, context);

            expect(codeActions).toHaveLength(1);
            expect(codeActions[0].diagnostics).toEqual([sampleDiag1])
        });

        it('Diagnostics which are not CodeAnalyzerDiagnostic instances are filtered out', () => {
            const diag1: vscode.Diagnostic = new vscode.Diagnostic(new vscode.Range(1, 1, 1, 3), 'dummy diag1');

            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [diag1]});
            const selectedRange: vscode.Range = new vscode.Range(0, 0, sampleApexDocument.lineCount, 0); // select the whole file

            const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(sampleApexDocument, selectedRange, context);

            expect(codeActions).toHaveLength(0);
        });

        it('Valid diagnostics not within the selected range should be filtered out', () => {
            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [
                sampleDiag1, sampleDiag2, sampleDiag3, sampleDiag4, sampleDiag5, sampleDiag6, sampleDiag7]});
            const selectedRange: vscode.Range = sampleDiag2.range; // select the range of diag 2 (which isn't valid because it has no suggestions)
            const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(sampleApexDocument, selectedRange, context);
            
            expect(codeActions).toHaveLength(0);
        });
        
        // TODO: ADD IN MORE TESTS!!
    });
});