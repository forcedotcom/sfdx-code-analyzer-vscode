import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts
import { CodeAnalyzerDiagnostic, DiagnosticManager, DiagnosticManagerImpl, toRange } from "../../../lib/diagnostics";
import { FakeDiagnosticCollection } from "../vscode-stubs";
import { ViolationSuggestionsHoverProvider } from "../../../lib/violation-suggestions-hover-provider";
import { createTextDocument } from "jest-mock-vscode";
import { createSampleViolation } from "../test-utils";

describe('ViolationSuggestionsHoverProvider Tests', () => {
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
    const sampleDiag1: CodeAnalyzerDiagnostic = CodeAnalyzerDiagnostic.fromViolation(createSampleViolation(
        { file: sampleApexUri.fsPath, startLine: 4 }, 'AvoidUsingSchemaGetGlobalDescribe', 'apexguru', [],
        [{ 
            location: { file: sampleApexUri.fsPath, startLine: 4 },
            message: 'This is a single line suggestion that uses the same location as the violation'
        }]
    ));
    const sampleDiag2: CodeAnalyzerDiagnostic = CodeAnalyzerDiagnostic.fromViolation(createSampleViolation(
        { file: sampleApexUri.fsPath, startLine: 9 }, 'AvoidSOQLInLoop', 'apexguru', [], [] // no suggestions
    ));
    const sampleDiag3: CodeAnalyzerDiagnostic = CodeAnalyzerDiagnostic.fromViolation(createSampleViolation(
        { file: sampleApexUri.fsPath, startLine: 13 }, 'AvoidDMLInLoop', 'apexguru', [], [] // no suggestions
    ));
    const sampleDiag4: CodeAnalyzerDiagnostic = CodeAnalyzerDiagnostic.fromViolation(createSampleViolation(
        { file: sampleApexUri.fsPath, startLine: 18 }, 'AvoidSOQLWithNegativeExpression', 'apexguru', [],
        [{ 
            location: { file: '/someOtherFile.cls', startLine: 4 },
            message: 'This is suggestion that is associated with a different file'
        }]
    ));
    const sampleDiag5: CodeAnalyzerDiagnostic = CodeAnalyzerDiagnostic.fromViolation(createSampleViolation(
        { file: sampleApexUri.fsPath, startLine: 22 }, 'AvoidSOQLWithoutWhereClauseOrLimit', 'apexguru', [],
        [{ 
            location: { file: sampleApexUri.fsPath, startLine: 22, startColumn: 22, endLine: 22, endColumn: 33 },
            message: 'This is a multi\nline suggestion\nthat is only part of line 22'
        }]
    ));
    const sampleDiag6: CodeAnalyzerDiagnostic = CodeAnalyzerDiagnostic.fromViolation(createSampleViolation(
        { file: sampleApexUri.fsPath, startLine: 26 }, 'AvoidUsingSObjectsToInBind', 'apexguru', [],
        [{ 
            location: { file: sampleApexUri.fsPath, startLine: 22, startColumn: 26, endLine: 23, endColumn: 6 },
            message: 'This is a suggestion associated with a violation on line 26 but it shows up between line 22 and 23'
        }]
    ));
    const sampleDiag7: CodeAnalyzerDiagnostic = CodeAnalyzerDiagnostic.fromViolation(createSampleViolation(
        { file: sampleApexUri.fsPath, startLine: 30 }, 'AvoidSOQLWithWildcardFilters', 'apexguru', [],
        [{ 
            location: { file: sampleApexUri.fsPath, startLine: 30, endLine: 32 },
            message: 'This is a suggestion associated with a violation on line 30 but it shows up on lines 31 and 32'
        },
        {
            location: { file: sampleApexUri.fsPath, startLine: 30 },
            message: 'This is another suggestion that only shows up on line 30'
        }]
    ));

    let diagnosticCollection: vscode.DiagnosticCollection;
    let diagnosticManager: DiagnosticManager;
    let hoverProvider: vscode.HoverProvider;

    beforeEach(() => {
        diagnosticCollection = new FakeDiagnosticCollection();
        diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);
        hoverProvider = new ViolationSuggestionsHoverProvider(diagnosticManager);
        diagnosticManager.addDiagnostics([sampleDiag1, sampleDiag2, sampleDiag3, sampleDiag4, sampleDiag5, sampleDiag6, sampleDiag7]);
    });

    describe('provideHover Tests', () => {
        it('When the file of interest has no diagnostics, then return undefined', () => {
            const result: vscode.ProviderResult<vscode.Hover> = hoverProvider.provideHover(
                createTextDocument(vscode.Uri.file('./someOtherFile.cls'), 'dummy content', 'apex'),
                new vscode.Position(3, 0), undefined);
            expect(result).toBeUndefined();
        });

        it('When the cursor position is not within a suggestion location, then return undefined', () => {
            const result: vscode.ProviderResult<vscode.Hover> = hoverProvider.provideHover(sampleApexDocument,
                new vscode.Position(8, 0), undefined); // This is line 9 which has a diagnostic but no suggestion
            expect(result).toBeUndefined();
        });

        it('When the cursor position is within a single suggestion location, then return that suggestion', () => {
            const result: vscode.ProviderResult<vscode.Hover> = hoverProvider.provideHover(sampleApexDocument, new vscode.Position(3, 2), undefined);
            const hover: vscode.Hover = expectHoverInstance(result);
            expect(hover.contents).toHaveLength(1);
            const markdown: vscode.MarkdownString = expectMarkdownStringInstance(hover.contents[0]);
            expect(markdown.value).toContain("apexguru.AvoidUsingSchemaGetGlobalDescribe");
            expect(markdown.value).toContain("This is a single line suggestion that uses the same location as the violation");
            expect(markdown.value).toContain("$(copy) Copy");
            expect(markdown.isTrusted).toEqual(true);
            expect(markdown.supportHtml).toEqual(true);
            expect(markdown.supportThemeIcons).toEqual(true);
            expect(hover.range).toEqual(toRange({startLine: 4}));
        });

        it('When the cursor position is on the line that has multiple suggestions from different diagnostics, but on the column that is only associated with one suggestion, then just return the one', () => {
            const result: vscode.ProviderResult<vscode.Hover> = hoverProvider.provideHover(sampleApexDocument,
                new vscode.Position(21, 22), undefined); // Line 22, Col 23
            const hover: vscode.Hover = expectHoverInstance(result);
            expect(hover.contents).toHaveLength(1);
            const markdown: vscode.MarkdownString = expectMarkdownStringInstance(hover.contents[0]);
            expect(markdown.value).toContain("apexguru.AvoidSOQLWithoutWhereClauseOrLimit");
            expect(markdown.value).toContain("This is a multi\nline suggestion\nthat is only part of line 22");
            expect(markdown.value).toContain("$(copy) Copy");
            expect(hover.range).toEqual(toRange({ startLine: 22, startColumn: 22, endLine: 22, endColumn: 33 }));
        });

        it('When the cursor position is on the line and a column that has multiple suggestions from different diagnostics, then both are returned', () => {
            const result: vscode.ProviderResult<vscode.Hover> = hoverProvider.provideHover(sampleApexDocument,
                new vscode.Position(21, 25), undefined); // Line 22, Col 26
            const hover: vscode.Hover = expectHoverInstance(result);
            expect(hover.contents).toHaveLength(2);
            const markdown1: vscode.MarkdownString = expectMarkdownStringInstance(hover.contents[0]);
            expect(markdown1.value).toContain("apexguru.AvoidSOQLWithoutWhereClauseOrLimit");
            expect(markdown1.value).toContain("This is a multi\nline suggestion\nthat is only part of line 22");
            expect(markdown1.value).toContain("$(copy) Copy");
            const markdown2: vscode.MarkdownString = expectMarkdownStringInstance(hover.contents[1]);
            expect(markdown2.value).toContain("apexguru.AvoidUsingSObjectsToInBind");
            expect(markdown2.value).toContain("This is a suggestion associated with a violation on line 26 but it shows up between line 22 and 23");
            expect(markdown2.value).toContain("$(copy) Copy");
            // The range should the intersection of both code locations:
            // That is 22:22 (the start of the first suggestion) to 23:6 (the end of the last suggestion)
            expect(hover.range).toEqual(toRange({ startLine: 22, startColumn: 22, endLine: 23, endColumn: 6 }));
        });

        it('When the cursor position is on the line that has multiple suggestions from the same diagnostic, but on the column that is only associated with one suggestion, then just return the one', () => {
            const result: vscode.ProviderResult<vscode.Hover> = hoverProvider.provideHover(sampleApexDocument,
                new vscode.Position(30, 5), undefined); // Line 31, Col 6
            const hover: vscode.Hover = expectHoverInstance(result);
            expect(hover.contents).toHaveLength(1);
            const markdown: vscode.MarkdownString = expectMarkdownStringInstance(hover.contents[0])
            expect(markdown.value).toContain("apexguru.AvoidSOQLWithWildcardFilters");
            expect(markdown.value).toContain("This is a suggestion associated with a violation on line 30 but it shows up on lines 31 and 32");
            expect(hover.range).toEqual(toRange({ startLine: 30, endLine: 32 }));
        });

        it('When the cursor position is on the line and a column that has multiple suggestions from the same diagnostic, then both are returned', () => {
            const result: vscode.ProviderResult<vscode.Hover> = hoverProvider.provideHover(sampleApexDocument,
                new vscode.Position(29, 0), undefined); // Line 30, Col 1
            const hover: vscode.Hover = expectHoverInstance(result);
            expect(hover.contents).toHaveLength(2);
            const markdown1: vscode.MarkdownString = expectMarkdownStringInstance(hover.contents[0])
            expect(markdown1.value).toContain("apexguru.AvoidSOQLWithWildcardFilters");
            expect(markdown1.value).toContain("This is a suggestion associated with a violation on line 30 but it shows up on lines 31 and 32");
            const markdown2: vscode.MarkdownString = expectMarkdownStringInstance(hover.contents[1])
            expect(markdown2.value).toContain("apexguru.AvoidSOQLWithWildcardFilters");
            expect(markdown2.value).toContain("This is another suggestion that only shows up on line 30");
        });
    });
});

function expectHoverInstance(result: unknown): vscode.Hover {
    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(vscode.Hover);
    return result as vscode.Hover;
}

function expectMarkdownStringInstance(result: unknown): vscode.MarkdownString {
    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(vscode.MarkdownString);
    return result as vscode.MarkdownString;
}