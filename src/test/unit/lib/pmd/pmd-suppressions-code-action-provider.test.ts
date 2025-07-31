import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts
import { createSampleCodeAnalyzerDiagnostic } from '../../test-utils';
import { createTextDocument } from "jest-mock-vscode";
import { PMDSupressionsCodeActionProvider } from "../../../../lib/pmd/pmd-suppressions-code-action-provider";
import { StubCodeActionContext } from "../../vscode-stubs";
import { CodeAnalyzerDiagnostic } from "../../../../lib/diagnostics";

const MAX_COL: number = Number.MAX_SAFE_INTEGER;

describe('PMDSupressionsCodeActionProvider Tests', () => {
    let actionProvider: PMDSupressionsCodeActionProvider;

    beforeEach(() => {
        actionProvider = new PMDSupressionsCodeActionProvider();
    });

    describe('provideCodeActions Tests', () => {
        const sampleApexUri: vscode.Uri = vscode.Uri.file('/someFile.cls');

        const sampleApexContent1: string = 
            'public with sharing class EmptyCatchBlock {\n' +
            //               ↙ diag1 start (line 1, col 16)
            '    public void swallowException() {\n' +
            //                               ↖ diag1 end (line 1, col 32)
            '        try {\n' +
            '            insert accounts;\n' + 
            //         ↙ diag2 start (line 4, col 10)
            '        } catch (DmlException dmle) {\n' +
            '            // swallowed exception\n' +
            '        }\n' +
            //        ↖ diag2 end (line 6, col 9)
            '    }\n' +
            '}';
        const sampleApexDocument1: vscode.TextDocument = createTextDocument(sampleApexUri, sampleApexContent1, 'apex');
        const sampleDiag1Range: vscode.Range = new vscode.Range(1, 16, 1, 32);
        const sampleDiag1: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(sampleApexUri, sampleDiag1Range, 'ApexDoc', 'pmd');
        const sampleDiag2Range: vscode.Range = new vscode.Range(4, 10, 6, 9);
        const sampleDiag2: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(sampleApexUri, sampleDiag2Range, 'EmptyCatchBlock', 'pmd');

        const sampleApexContent2: string = 
            `@SuppressWarnings('PMD.EmptyCatchBlock')\n` +
            sampleApexContent1;
        const sampleApexDocument2: vscode.TextDocument = createTextDocument(sampleApexUri, sampleApexContent2, 'apex');
        const sampleDiag3Range: vscode.Range = new vscode.Range(2, 16, 2, 32);
        const sampleDiag3: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(sampleApexUri, sampleDiag3Range, 'ApexDoc', 'pmd');


        it('When a single valid pmd diagnostic is within the selected range, then 2 code action are returned - one for line level suppression and one for class level suppression', () => {
            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [sampleDiag1, sampleDiag2]});
            const selectedRange: vscode.Range = sampleDiag2Range; // Only have the selection range be the diag2 range
            const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(sampleApexDocument1, selectedRange, context);

            expect(codeActions).toHaveLength(2);

            // Validate the line level suppression action
            expect(codeActions[0].title).toEqual("Suppress all PMD violations on this line.");
            const lineEdits: vscode.TextEdit[] = codeActions[0].edit.get(sampleApexUri);
            expect(lineEdits).toHaveLength(1);
            expect(lineEdits[0].range).toEqual(new vscode.Range(4, MAX_COL, 4, MAX_COL));
            expect(lineEdits[0].newText).toEqual(" // NOPMD");
            expect(codeActions[0].command.command).toEqual("sfca.removeDiagnosticsInRange"); // TODO: This is wrong. We should only be clearing the PMD violations on this line - not all within the range


            // Validate the class level supression action
            expect(codeActions[1].title).toEqual("Suppress 'PMD.EmptyCatchBlock' on this class.");
            const classEdits: vscode.TextEdit[] = codeActions[1].edit.get(sampleApexUri);
            expect(classEdits).toHaveLength(1);
            expect(classEdits[0].range).toEqual(new vscode.Range(0, 0, 0, 0));
            expect(classEdits[0].newText).toEqual("@SuppressWarnings('PMD.EmptyCatchBlock')\n");
            expect(codeActions[1].command.command).toEqual("sfca.removeDiagnosticsOnSelectedFile"); // TODO: This is wrong. It should only clear the PMD diagnostics within the class instead of all diagnostics within the file
        });

        it('When multiple valid pmd diagnostics on separate lines are within the selected range, then 2 code action are returned for each diagnostic', () => {
            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [sampleDiag1, sampleDiag2]});
            const selectedRange: vscode.Range = new vscode.Range(0, 0, sampleApexDocument1.lineCount, 0); // select the whole file
            const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(sampleApexDocument1, selectedRange, context);

            expect(codeActions).toHaveLength(4);
            expect(codeActions[0].title).toEqual("Suppress all PMD violations on this line."); // TODO: We should really say the line number here to avoid confusion
            expect(codeActions[1].title).toEqual("Suppress 'PMD.ApexDoc' on this class.");
            expect(codeActions[2].title).toEqual("Suppress all PMD violations on this line."); // TODO: We should really say the line number here to avoid confusion
            expect(codeActions[3].title).toEqual("Suppress 'PMD.EmptyCatchBlock' on this class.");
        });

        it('When multiple valid pmd diagnostics are on the same line, then we only return 1 of the line suppressing diagnostics', () => {
            const diag1: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(sampleApexUri, new vscode.Range(1, 1, 1, 3), 'DummyRule1', 'pmd');
            const diag2: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(sampleApexUri, new vscode.Range(1, 7, 3, 7), 'DummyRule2', 'pmd');
            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [diag1, diag2]});
            const selectedRange: vscode.Range = new vscode.Range(0, 0, sampleApexDocument1.lineCount, 0); // select the whole file
            const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(sampleApexDocument1, selectedRange, context);

            expect(codeActions).toHaveLength(3);
            expect(codeActions[0].title).toEqual("Suppress all PMD violations on this line.");
            expect(codeActions[1].title).toEqual("Suppress 'PMD.DummyRule1' on this class.");
            expect(codeActions[2].title).toEqual("Suppress 'PMD.DummyRule2' on this class.");
        });

        it('When a valid pmd diagnostic exists in a class that already has an existing SuppressWarning annotation, then 2 code action appends to it correctly', () => {
            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [sampleDiag3]});
            const selectedRange: vscode.Range = sampleDiag3Range; // Only have the selection range be the diag3 range
            const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(sampleApexDocument2, selectedRange, context);

            expect(codeActions).toHaveLength(2);

            // Validate the line level suppression action
            expect(codeActions[0].title).toEqual("Suppress all PMD violations on this line.");
            const lineEdits: vscode.TextEdit[] = codeActions[0].edit.get(sampleApexUri);
            expect(lineEdits).toHaveLength(1);
            expect(lineEdits[0].range).toEqual(new vscode.Range(2, MAX_COL, 2, MAX_COL));
            expect(lineEdits[0].newText).toEqual(" // NOPMD");
            expect(codeActions[0].command.command).toEqual("sfca.removeDiagnosticsInRange"); // TODO: This is wrong. We should only be clearing the PMD violations on this line - not all within the range


            // Validate the class level supression action
            expect(codeActions[1].title).toEqual("Suppress 'PMD.ApexDoc' on this class.");
            const classEdits: vscode.TextEdit[] = codeActions[1].edit.get(sampleApexUri);
            expect(classEdits).toHaveLength(1);
            expect(classEdits[0].range).toEqual(new vscode.Range(0, 0, 0, 40));
            expect(classEdits[0].newText).toEqual("@SuppressWarnings('PMD.EmptyCatchBlock, PMD.ApexDoc')");
            expect(codeActions[1].command.command).toEqual("sfca.removeDiagnosticsOnSelectedFile"); // TODO: This is wrong. It should only clear the PMD diagnostics within the class instead of all diagnostics within the file
        });

        it('When document language is not apex, then return no code actions', () => {
            const sampleUri: vscode.Uri = vscode.Uri.file('/someFile.xml');
            const sampleContent: string = 
            //   ↙ Diag start (line 0, col 0)
                '<hello>\n' +
                '</hello>';
            //           ↖ Diag end (line 1, col 7)

            const xmlDocument: vscode.TextDocument = createTextDocument(sampleUri, sampleContent, 'xml'); // not apex
            const diagRange: vscode.Range = new vscode.Range(0, 0, 1, 7);
            const diag: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, diagRange, 'EmptyCatchBlock', 'pmd');
            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [diag]});
            const selectedRange: vscode.Range = diagRange;
            const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(xmlDocument, selectedRange, context);

            expect(codeActions).toHaveLength(0);
        });

        it('diagnostics not associated with pmd engine are filtered out', () => {
            const diag1: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(sampleApexUri, new vscode.Range(1, 1, 1, 3), 'DummyRule1', 'other');
            const diag2: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(sampleApexUri, new vscode.Range(2, 7, 3, 7), 'DummyRule2', 'pmd');
            
            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [diag1, diag2]});
            const selectedRange: vscode.Range = new vscode.Range(0, 0, sampleApexDocument1.lineCount, 0); // select the whole file

            const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(sampleApexDocument1, selectedRange, context);

            expect(codeActions).toHaveLength(2);
            expect(codeActions[0].title).toEqual("Suppress all PMD violations on this line.");
            expect(codeActions[1].title).toEqual("Suppress 'PMD.DummyRule2' on this class.");
        });

        it('stale diagnostics are filtered out', () => {
            const diag1: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleApexUri, new vscode.Range(1, 1, 1, 3), 'DummyRule1', 'pmd');
            const diag2: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleApexUri, new vscode.Range(2, 7, 3, 7), 'DummyRule2', 'pmd');
            diag2.markStale();

            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [diag1, diag2]});
            const selectedRange: vscode.Range = new vscode.Range(0, 0, sampleApexDocument1.lineCount, 0); // select the whole file

            const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(sampleApexDocument1, selectedRange, context);

            expect(codeActions).toHaveLength(2);
            expect(codeActions[0].title).toEqual("Suppress all PMD violations on this line.");
            expect(codeActions[1].title).toEqual("Suppress 'PMD.DummyRule1' on this class.");
        });

        it('Diagnostics which are not CodeAnalyzerDiagnostic instances are filtered out', () => {
            const diag1: vscode.Diagnostic = new vscode.Diagnostic(new vscode.Range(1, 1, 1, 3), 'dummy diag1');
            const diag2: vscode.Diagnostic = new vscode.Diagnostic(new vscode.Range(2, 1, 2, 5), 'dummy diag2');

            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [diag1, diag2]});
            const selectedRange: vscode.Range = new vscode.Range(0, 0, sampleApexDocument1.lineCount, 0); // select the whole file

            const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(sampleApexDocument1, selectedRange, context);

            expect(codeActions).toHaveLength(0); // Also tests that if all diagnostics are filtered out we don't error
        });

        it('Valid diagnostics not within the selected range should be filtered out', () => {
            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [sampleDiag1, sampleDiag2]});
            const selectedRange: vscode.Range = new vscode.Range(2, 0, 2, MAX_COL); // does not overlap any diagnostic range
            const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(sampleApexDocument1, selectedRange, context);
            
            expect(codeActions).toHaveLength(0);
        });

        // TODO: ADD IN MORE TESTS!!
        // NOTE THAT THE OLD LEGACY TESTS JUST CHECKED IMPLEMENTATION DETAIL (regex patterns) SO THEY WERE REMOVED.
        // BUT THE FILES test/code-fixtures/fixer-tests/*.cls STILL REMAIN BECAUSE THEY HELP TEST SOME EDGE CASES
        // WHICH THE CURRENT regex BASED IMPLEMENTATION IS SENSITIVE AROUND. SO WE SHOULD ADD IN SOME EDGE CASE TESTS
        // THAT USE THOSE CODE SNIPPETS WHEN WE HAVE SOME TIME TO DO SO.
    });
});