import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts
import { createSampleCodeAnalyzerDiagnostic } from '../../test-utils';
import { createTextDocument } from "jest-mock-vscode";
import { PMDSupressionsCodeActionProvider } from "../../../src/lib/pmd/pmd-suppressions-code-action-provider";
import { StubCodeActionContext } from "../../vscode-stubs";
import { CodeAnalyzerDiagnostic } from "../../../src/lib/diagnostics";

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
            expect(codeActions[0].title).toEqual("Suppress all 'pmd' violations on this line");
            const lineEdits: vscode.TextEdit[] = codeActions[0].edit.get(sampleApexUri);
            expect(lineEdits).toHaveLength(1);
            expect(lineEdits[0].range).toEqual(new vscode.Range(4, MAX_COL, 4, MAX_COL));
            expect(lineEdits[0].newText).toEqual(" // NOPMD");
            expect(codeActions[0].command.command).toEqual("sfca.removeDiagnosticsInRange"); // TODO: This is wrong. We should only be clearing the PMD violations on this line - not all within the range


            // Validate the class level supression action
            expect(codeActions[1].title).toEqual("Suppress 'pmd.EmptyCatchBlock' on this class");
            const classEdits: vscode.TextEdit[] = codeActions[1].edit.get(sampleApexUri);
            expect(classEdits).toHaveLength(1);
            expect(classEdits[0].range).toEqual(new vscode.Range(0, 0, 0, 0));
            expect(classEdits[0].newText).toEqual("@SuppressWarnings('PMD.EmptyCatchBlock')\n");
            expect(codeActions[1].command.command).toEqual("sfca.removeDiagnosticsInRangeByRule");
            // Verify the command uses class range and rule info to clear only this rule's violations within the class
            expect(codeActions[1].command.arguments).toHaveLength(4);
            expect(codeActions[1].command.arguments[0]).toEqual(sampleApexUri);
            expect(codeActions[1].command.arguments[1]).toBeInstanceOf(vscode.Range);
            const classRange = codeActions[1].command.arguments[1] as vscode.Range;
            expect(classRange.start.line).toEqual(0);  // Class starts at line 0
            expect(classRange.end.line).toEqual(8);    // Class ends at line 8
            expect(codeActions[1].command.arguments[2]).toEqual('pmd');  // Engine
            expect(codeActions[1].command.arguments[3]).toEqual('EmptyCatchBlock');  // Rule name
        });

        it('When multiple valid pmd diagnostics on separate lines are within the selected range, then 2 code action are returned for each diagnostic', () => {
            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [sampleDiag1, sampleDiag2]});
            const selectedRange: vscode.Range = new vscode.Range(0, 0, sampleApexDocument1.lineCount, 0); // select the whole file
            const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(sampleApexDocument1, selectedRange, context);

            expect(codeActions).toHaveLength(4);
            expect(codeActions[0].title).toEqual("Suppress all 'pmd' violations on this line"); // TODO: We should really say the line number here to avoid confusion
            expect(codeActions[1].title).toEqual("Suppress 'pmd.ApexDoc' on this class");
            expect(codeActions[2].title).toEqual("Suppress all 'pmd' violations on this line"); // TODO: We should really say the line number here to avoid confusion
            expect(codeActions[3].title).toEqual("Suppress 'pmd.EmptyCatchBlock' on this class");
        });

        it('When multiple valid pmd diagnostics are on the same line, then we only return 1 of the line suppressing diagnostics', () => {
            const diag1: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(sampleApexUri, new vscode.Range(1, 1, 1, 3), 'DummyRule1', 'pmd');
            const diag2: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(sampleApexUri, new vscode.Range(1, 7, 3, 7), 'DummyRule2', 'pmd');
            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [diag1, diag2]});
            const selectedRange: vscode.Range = new vscode.Range(0, 0, sampleApexDocument1.lineCount, 0); // select the whole file
            const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(sampleApexDocument1, selectedRange, context);

            expect(codeActions).toHaveLength(3);
            expect(codeActions[0].title).toEqual("Suppress all 'pmd' violations on this line");
            expect(codeActions[1].title).toEqual("Suppress 'pmd.DummyRule1' on this class");
            expect(codeActions[2].title).toEqual("Suppress 'pmd.DummyRule2' on this class");
        });

        it('When a valid pmd diagnostic exists in a class that already has an existing SuppressWarning annotation, then 2 code action appends to it correctly', () => {
            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [sampleDiag3]});
            const selectedRange: vscode.Range = sampleDiag3Range; // Only have the selection range be the diag3 range
            const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(sampleApexDocument2, selectedRange, context);

            expect(codeActions).toHaveLength(2);

            // Validate the line level suppression action
            expect(codeActions[0].title).toEqual("Suppress all 'pmd' violations on this line");
            const lineEdits: vscode.TextEdit[] = codeActions[0].edit.get(sampleApexUri);
            expect(lineEdits).toHaveLength(1);
            expect(lineEdits[0].range).toEqual(new vscode.Range(2, MAX_COL, 2, MAX_COL));
            expect(lineEdits[0].newText).toEqual(" // NOPMD");
            expect(codeActions[0].command.command).toEqual("sfca.removeDiagnosticsInRange"); // TODO: This is wrong. We should only be clearing the PMD violations on this line - not all within the range


            // Validate the class level supression action
            expect(codeActions[1].title).toEqual("Suppress 'pmd.ApexDoc' on this class");
            const classEdits: vscode.TextEdit[] = codeActions[1].edit.get(sampleApexUri);
            expect(classEdits).toHaveLength(1);
            expect(classEdits[0].range).toEqual(new vscode.Range(0, 0, 0, 40));
            expect(classEdits[0].newText).toEqual("@SuppressWarnings('PMD.EmptyCatchBlock,PMD.ApexDoc')");
            expect(codeActions[1].command.command).toEqual("sfca.removeDiagnosticsInRangeByRule");
            // Verify the command uses class range and rule info to clear only this rule's violations within the class
            expect(codeActions[1].command.arguments).toHaveLength(4);
            expect(codeActions[1].command.arguments[0]).toEqual(sampleApexUri);
            expect(codeActions[1].command.arguments[1]).toBeInstanceOf(vscode.Range);
            const classRange = codeActions[1].command.arguments[1] as vscode.Range;
            expect(classRange.start.line).toEqual(1);  // Class starts at line 1 (after the @SuppressWarnings)
            expect(classRange.end.line).toEqual(9);    // Class ends at line 9
            expect(codeActions[1].command.arguments[2]).toEqual('pmd');  // Engine
            expect(codeActions[1].command.arguments[3]).toEqual('ApexDoc');  // Rule name
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
            expect(codeActions[0].title).toEqual("Suppress all 'pmd' violations on this line");
            expect(codeActions[1].title).toEqual("Suppress 'pmd.DummyRule2' on this class");
        });

        it('stale diagnostics are filtered out', () => {
            const diag1: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleApexUri, new vscode.Range(1, 1, 1, 3), 'DummyRule1', 'pmd');
            const diag2: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleApexUri, new vscode.Range(2, 7, 3, 7), 'DummyRule2', 'pmd');
            diag2.markStale();

            const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [diag1, diag2]});
            const selectedRange: vscode.Range = new vscode.Range(0, 0, sampleApexDocument1.lineCount, 0); // select the whole file

            const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(sampleApexDocument1, selectedRange, context);

            expect(codeActions).toHaveLength(2);
            expect(codeActions[0].title).toEqual("Suppress all 'pmd' violations on this line");
            expect(codeActions[1].title).toEqual("Suppress 'pmd.DummyRule1' on this class");
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

        describe('Class-Level Suppression with Multiple Classes Tests', () => {
            it('Class level suppression should only clear diagnostics within the specific class, not the entire file', () => {
                const multiClassContent: string = 
                    'public class FirstClass {\n' +         // line 0
                    '    public void method1() {\n' +       // line 1
                    '        // some code\n' +              // line 2
                    '    }\n' +                             // line 3
                    '}\n' +                                 // line 4
                    '\n' +                                  // line 5
                    'public class SecondClass {\n' +        // line 6
                    '    public void method2() {\n' +       // line 7
                    '        // some code\n' +              // line 8
                    '    }\n' +                             // line 9
                    '}';                                    // line 10

                const multiClassUri: vscode.Uri = vscode.Uri.file('/multiClass.cls');
                const multiClassDocument: vscode.TextDocument = createTextDocument(multiClassUri, multiClassContent, 'apex');
                
                // Create a diagnostic in the second class
                const diagInSecondClass: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(
                    multiClassUri, 
                    new vscode.Range(7, 4, 7, 20), 
                    'TestRule', 
                    'pmd'
                );

                const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [diagInSecondClass]});
                const selectedRange: vscode.Range = new vscode.Range(7, 4, 7, 20);
                const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(multiClassDocument, selectedRange, context);

                expect(codeActions).toHaveLength(2);
                
                // Validate the class level suppression action targets only SecondClass for this specific rule
                expect(codeActions[1].title).toEqual("Suppress 'pmd.TestRule' on this class");
                expect(codeActions[1].command.command).toEqual("sfca.removeDiagnosticsInRangeByRule");
                expect(codeActions[1].command.arguments).toHaveLength(4);
                expect(codeActions[1].command.arguments[0]).toEqual(multiClassUri);
                // Should use SecondClass range, not FirstClass or the entire file
                const classRange = codeActions[1].command.arguments[1] as vscode.Range;
                expect(classRange.start.line).toEqual(6);  // SecondClass starts at line 6
                expect(classRange.end.line).toEqual(10);   // SecondClass ends at line 10
                expect(codeActions[1].command.arguments[2]).toEqual('pmd');  // Engine
                expect(codeActions[1].command.arguments[3]).toEqual('TestRule');  // Rule name
            });

            it('Class level suppression should handle inner classes correctly', () => {
                const innerClassContent: string = 
                    'public class OuterClass {\n' +         // line 0
                    '    public void outerMethod() {\n' +   // line 1
                    '        // outer code\n' +             // line 2
                    '    }\n' +                             // line 3
                    '    \n' +                              // line 4
                    '    public class InnerClass {\n' +     // line 5
                    '        public void innerMethod() {\n' + // line 6
                    '            // inner code\n' +         // line 7
                    '        }\n' +                         // line 8
                    '    }\n' +                             // line 9
                    '}';                                    // line 10

                const innerClassUri: vscode.Uri = vscode.Uri.file('/innerClass.cls');
                const innerClassDocument: vscode.TextDocument = createTextDocument(innerClassUri, innerClassContent, 'apex');
                
                // Create a diagnostic in the inner class
                const diagInInnerClass: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(
                    innerClassUri, 
                    new vscode.Range(6, 8, 6, 20), 
                    'InnerTestRule', 
                    'pmd'
                );

                const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [diagInInnerClass]});
                const selectedRange: vscode.Range = new vscode.Range(6, 8, 6, 20);
                const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(innerClassDocument, selectedRange, context);

                expect(codeActions).toHaveLength(2);
                
                // Validate the class level suppression action targets the inner class for this specific rule
                expect(codeActions[1].title).toEqual("Suppress 'pmd.InnerTestRule' on this class");
                expect(codeActions[1].command.command).toEqual("sfca.removeDiagnosticsInRangeByRule");
                expect(codeActions[1].command.arguments).toHaveLength(4);
                expect(codeActions[1].command.arguments[0]).toEqual(innerClassUri);
                // Should use InnerClass range
                const classRange = codeActions[1].command.arguments[1] as vscode.Range;
                expect(classRange.start.line).toEqual(5);  // InnerClass starts at line 5
                expect(classRange.end.line).toEqual(9);    // InnerClass ends at line 9
                expect(codeActions[1].command.arguments[2]).toEqual('pmd');  // Engine
                expect(codeActions[1].command.arguments[3]).toEqual('InnerTestRule');  // Rule name
            });

            it('Class level suppression should work for class with annotations and comments', () => {
                const annotatedClassContent: string = 
                    '// This is a comment\n' +                              // line 0
                    '/* Multi-line comment\n' +                             // line 1
                    '   continues here */\n' +                              // line 2
                    '@RestResource(urlMapping=\'/myservice/*\')\n' +       // line 3
                    'public class AnnotatedClass {\n' +                     // line 4
                    '    public void method() {\n' +                        // line 5
                    '        // some code\n' +                              // line 6
                    '    }\n' +                                             // line 7
                    '}';                                                    // line 8

                const annotatedClassUri: vscode.Uri = vscode.Uri.file('/annotatedClass.cls');
                const annotatedClassDocument: vscode.TextDocument = createTextDocument(annotatedClassUri, annotatedClassContent, 'apex');
                
                const diagInAnnotatedClass: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(
                    annotatedClassUri, 
                    new vscode.Range(5, 4, 5, 10), 
                    'AnnotatedTestRule', 
                    'pmd'
                );

                const context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [diagInAnnotatedClass]});
                const selectedRange: vscode.Range = new vscode.Range(5, 4, 5, 10);
                const codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(annotatedClassDocument, selectedRange, context);

                expect(codeActions).toHaveLength(2);
                
                // Validate the class level suppression action for this specific rule
                expect(codeActions[1].title).toEqual("Suppress 'pmd.AnnotatedTestRule' on this class");
                expect(codeActions[1].command.command).toEqual("sfca.removeDiagnosticsInRangeByRule");
                expect(codeActions[1].command.arguments).toHaveLength(4);
                expect(codeActions[1].command.arguments[0]).toEqual(annotatedClassUri);
                // Should use class range
                const classRange = codeActions[1].command.arguments[1] as vscode.Range;
                expect(classRange.start.line).toEqual(4);  // Class declaration starts at line 4
                expect(classRange.end.line).toEqual(8);    // Class ends at line 8
                expect(codeActions[1].command.arguments[2]).toEqual('pmd');  // Engine
                expect(codeActions[1].command.arguments[3]).toEqual('AnnotatedTestRule');  // Rule name
            });

            it('Class level suppression should handle multiple levels of nested classes correctly', () => {
                const deeplyNestedContent: string = 
                    'public class OuterClass {\n' +                 // line 0
                    '    public void outerMethod() {\n' +           // line 1
                    '        // outer code\n' +                     // line 2
                    '    }\n' +                                     // line 3
                    '    \n' +                                      // line 4
                    '    public class Inner1 {\n' +                 // line 5
                    '        public void inner1Method() {\n' +      // line 6
                    '            // inner1 code\n' +                // line 7
                    '        }\n' +                                 // line 8
                    '        \n' +                                  // line 9
                    '        public class Inner2 {\n' +             // line 10
                    '            public void inner2Method() {\n' +  // line 11
                    '                // inner2 code\n' +            // line 12
                    '            }\n' +                             // line 13
                    '            \n' +                              // line 14
                    '            public class Inner3 {\n' +         // line 15
                    '                public void inner3Method() {\n' + // line 16
                    '                    // deepest code\n' +       // line 17
                    '                }\n' +                         // line 18
                    '            }\n' +                             // line 19 (Inner3 closes)
                    '        }\n' +                                 // line 20 (Inner2 closes)
                    '    }\n' +                                     // line 21 (Inner1 closes)
                    '}';                                            // line 22 (OuterClass closes)

                const deeplyNestedUri: vscode.Uri = vscode.Uri.file('/deeplyNested.cls');
                const deeplyNestedDocument: vscode.TextDocument = createTextDocument(deeplyNestedUri, deeplyNestedContent, 'apex');
                
                // Test 1: Diagnostic in Inner3 (deepest level)
                const diagInInner3: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(
                    deeplyNestedUri, 
                    new vscode.Range(16, 16, 16, 28), 
                    'Inner3Rule', 
                    'pmd'
                );

                let context: vscode.CodeActionContext = new StubCodeActionContext({diagnostics: [diagInInner3]});
                let selectedRange: vscode.Range = new vscode.Range(16, 16, 16, 28);
                let codeActions: vscode.CodeAction[] = actionProvider.provideCodeActions(deeplyNestedDocument, selectedRange, context);

                expect(codeActions).toHaveLength(2);
                expect(codeActions[1].title).toEqual("Suppress 'pmd.Inner3Rule' on this class");
                expect(codeActions[1].command.arguments).toHaveLength(4);
                expect(codeActions[1].command.arguments[0]).toEqual(deeplyNestedUri);
                // Should use Inner3 class range
                let classRange = codeActions[1].command.arguments[1] as vscode.Range;
                expect(classRange.start.line).toEqual(15);  // Inner3 starts at line 15
                expect(classRange.end.line).toEqual(19);    // Inner3 ends at line 19
                expect(codeActions[1].command.arguments[2]).toEqual('pmd');  // Engine
                expect(codeActions[1].command.arguments[3]).toEqual('Inner3Rule');  // Rule name

                // Test 2: Diagnostic in Inner2 (middle level, containing Inner3)
                const diagInInner2: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(
                    deeplyNestedUri, 
                    new vscode.Range(11, 12, 11, 24), 
                    'Inner2Rule', 
                    'pmd'
                );

                context = new StubCodeActionContext({diagnostics: [diagInInner2]});
                selectedRange = new vscode.Range(11, 12, 11, 24);
                codeActions = actionProvider.provideCodeActions(deeplyNestedDocument, selectedRange, context);

                expect(codeActions).toHaveLength(2);
                expect(codeActions[1].title).toEqual("Suppress 'pmd.Inner2Rule' on this class");
                expect(codeActions[1].command.arguments).toHaveLength(4);
                expect(codeActions[1].command.arguments[0]).toEqual(deeplyNestedUri);
                // Should use Inner2 class range (includes Inner3)
                classRange = codeActions[1].command.arguments[1] as vscode.Range;
                expect(classRange.start.line).toEqual(10);  // Inner2 starts at line 10
                expect(classRange.end.line).toEqual(20);    // Inner2 ends at line 20
                expect(codeActions[1].command.arguments[2]).toEqual('pmd');  // Engine
                expect(codeActions[1].command.arguments[3]).toEqual('Inner2Rule');  // Rule name

                // Test 3: Diagnostic in Inner1 (contains Inner2 and Inner3)
                const diagInInner1: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(
                    deeplyNestedUri, 
                    new vscode.Range(6, 8, 6, 20), 
                    'Inner1Rule', 
                    'pmd'
                );

                context = new StubCodeActionContext({diagnostics: [diagInInner1]});
                selectedRange = new vscode.Range(6, 8, 6, 20);
                codeActions = actionProvider.provideCodeActions(deeplyNestedDocument, selectedRange, context);

                expect(codeActions).toHaveLength(2);
                expect(codeActions[1].title).toEqual("Suppress 'pmd.Inner1Rule' on this class");
                expect(codeActions[1].command.arguments).toHaveLength(4);
                expect(codeActions[1].command.arguments[0]).toEqual(deeplyNestedUri);
                // Should use Inner1 class range (includes Inner2 and Inner3)
                classRange = codeActions[1].command.arguments[1] as vscode.Range;
                expect(classRange.start.line).toEqual(5);   // Inner1 starts at line 5
                expect(classRange.end.line).toEqual(21);    // Inner1 ends at line 21
                expect(codeActions[1].command.arguments[2]).toEqual('pmd');  // Engine
                expect(codeActions[1].command.arguments[3]).toEqual('Inner1Rule');  // Rule name

                // Test 4: Diagnostic in OuterClass (contains all inner classes)
                const diagInOuter: vscode.Diagnostic = createSampleCodeAnalyzerDiagnostic(
                    deeplyNestedUri, 
                    new vscode.Range(1, 4, 1, 16), 
                    'OuterRule', 
                    'pmd'
                );

                context = new StubCodeActionContext({diagnostics: [diagInOuter]});
                selectedRange = new vscode.Range(1, 4, 1, 16);
                codeActions = actionProvider.provideCodeActions(deeplyNestedDocument, selectedRange, context);

                expect(codeActions).toHaveLength(2);
                expect(codeActions[1].title).toEqual("Suppress 'pmd.OuterRule' on this class");
                expect(codeActions[1].command.arguments).toHaveLength(4);
                expect(codeActions[1].command.arguments[0]).toEqual(deeplyNestedUri);
                // Should use OuterClass range (includes all inner classes)
                classRange = codeActions[1].command.arguments[1] as vscode.Range;
                expect(classRange.start.line).toEqual(0);   // OuterClass starts at line 0
                expect(classRange.end.line).toEqual(22);    // OuterClass ends at line 22
                expect(codeActions[1].command.arguments[2]).toEqual('pmd');  // Engine
                expect(codeActions[1].command.arguments[3]).toEqual('OuterRule');  // Rule name
            });
        });
    });
});