import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts
import {createTextDocument} from "jest-mock-vscode";
import {FakeDiagnosticCollection} from "../vscode-stubs";
import {CodeAnalyzerDiagnostic, DiagnosticManager, DiagnosticManagerImpl} from "../../../lib/diagnostics";
import {createSampleCodeAnalyzerDiagnostic} from "../test-utils";

/*
    NOTE: Putting the tests for handleTextDocumentChangeEvent in its own file because it is a tricky algorithm and so
    there are a lot of tests that we need to have to ensure correctness.
 */

describe(`Tests for the the DiagnosticManager class's handleTextDocumentChangeEvent method`, () => {
    const sampleUri: vscode.Uri = vscode.Uri.file('someFile.cls');
    const sampleLines: string[] = [
        'This is line 0.',
        'And this is line 1.',
        'Notice, this is line 2.',
        'This is line 3.',
        'And last, but not least, this is line 4.'];

    const sampleDocument: vscode.TextDocument = createTextDocument(sampleUri, sampleLines.join('\n'), 'apex');

    let diagnosticCollection: FakeDiagnosticCollection;
    let diagnosticManager: DiagnosticManager;

    beforeEach(() => {
        diagnosticCollection = new FakeDiagnosticCollection();
        diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);
    });

    // Helper function to easily make an event for testing with a changeRange and replacementText
    function createTextDocumentChangeEventWith(changeRange: vscode.Range, replacementText: string): vscode.TextDocumentChangeEvent {
        let rangeOffset: number = changeRange.start.character;
        for (let i = 0; i < changeRange.start.line; i++) {
            rangeOffset += sampleLines[i].length;
        }
        let rangeLength: number = changeRange.end.character - changeRange.start.character;
        for (let i = changeRange.start.line; i < changeRange.end.line; i++) {
            rangeLength += sampleLines[i].length;
        }
        return {
            document: sampleDocument,
            contentChanges: [{
                range: changeRange,
                rangeOffset: rangeOffset,
                rangeLength: rangeLength,
                text: replacementText
            }],
            reason: undefined
        };
    }

    describe('Tests when there are zero or multiple diagnostics in the mix', () => {
        it('When there are zero diagnostics at all, then no-op', () => {
            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 2, 0, 9), 'some replacement text');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);
            expect(diagnosticCollection.diagMap.size).toEqual(0);
        });

        it('When there are diagnostics for another document but not one for the changed document, then no-op', () => {
            const rangeForOtherDoc: vscode.Range = new vscode.Range(2, 1, 2, 4);
            const diagForOtherDoc: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(vscode.Uri.file('anotherFile.cls'), rangeForOtherDoc);
            diagnosticManager.addDiagnostics([diagForOtherDoc]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 2, 0, 9), 'some replacement text');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            expect(Array.from(diagnosticCollection.diagMap.keys())).toEqual(['anotherFile.cls']);
            expect(diagnosticCollection.get(diagForOtherDoc.uri)).toHaveLength(1);
            expect(diagnosticCollection.get(diagForOtherDoc.uri)[0]).toEqual(diagForOtherDoc);
            expect(diagForOtherDoc.range).toEqual(rangeForOtherDoc); // Should still have the same range
        });

        it('When diagnostics come before change, then they remain untouched', () => {
            const range1: vscode.Range = new vscode.Range(0, 1, 0, 3);
            const diag1: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, range1);
            const range2: vscode.Range = new vscode.Range(1, 0, 2, 2);
            const diag2: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, range2);
            diagnosticManager.addDiagnostics([diag1, diag2]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(2, 4, 2, 7), 'some replacement\ntext');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag1, diag2]); // Same diagnostic instances
            expect(resultingDiags.map(d => d.range)).toEqual([range1, range2]); // Should still have same ranges
            expect(resultingDiags.map(d => d.isStale())).toEqual([false, false]); // ... that should not be stale
        });

        it('When diagnostics come after change, then they are both modified', () => {
            const range1: vscode.Range = new vscode.Range(1, 1, 1, 3);
            const diag1: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, range1);
            const range2: vscode.Range = new vscode.Range(1, 5, 2, 2);
            const diag2: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, range2);
            diagnosticManager.addDiagnostics([diag1, diag2]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 4, 0, 7), 'some replacement\ntext');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag1, diag2]); // Same diagnostic instances
            expect(resultingDiags.map(d => d.range)).toEqual([  // Ranges should have changed
                new vscode.Range(2, 1, 2, 3), new vscode.Range(2, 5, 3, 2)]);
            expect(resultingDiags.map(d => d.isStale())).toEqual([false, false]); // ... that should not be stale
        });

        it('When one diagnostic comes before change and another after, then only the one that came after is modified', () => {
            const range1: vscode.Range = new vscode.Range(0, 0, 0, 3);
            const diag1: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, range1);
            const range2: vscode.Range = new vscode.Range(1, 5, 2, 2);
            const diag2: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, range2);
            diagnosticManager.addDiagnostics([diag1, diag2]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 4, 0, 7), 'some replacement\ntext');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag1, diag2]); // Same diagnostic instances
            expect(resultingDiags.map(d => d.range)).toEqual([  // Only second range should have changed
                range1, new vscode.Range(2, 5, 3, 2)]);
            expect(resultingDiags.map(d => d.isStale())).toEqual([false, false]); // ... that should not be stale
        });
    });



    describe('Exhaustive single diagnostic tests', () => {

        // KEY: _         >1 lines of code
        //      .         single line of code
        //      {.}->{.}  single line change range replaced by single line
        //      {.}->{_}  single line change range replaced by >1 lines
        //      {_}->{.}  multi line change range replaced by single line
        //      {_}->{_}  multi line change range replaced by >1 lines
        //      [.]       diagnostic range containing a 1 line
        //      [_]       diagnostic range containing >1 lines


        // _{.}->{.}_[.]_
        it('1 line change range is before a 1 line diagnostic range (on separate lines). Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 0, 1, 4));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 1, 0, 3), '1 line replacement');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(1, 0, 1, 4)); // ... with same range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _{.}->{_}_[.]_
        it('1 line change range is before a 1 line diagnostic range (on separate lines). Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 0, 1, 4));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 1, 0, 3), 'multi-line\nreplacement');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(2, 0, 2, 4)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _{_}->{.}_[.]_
        it('>1 lines change range is before a 1 line diagnostic range (on separate lines). Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(3, 0, 3, 4));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 1, 2, 3), '1 line replacement');  // Change spans lines 0 to 2 but is replaced with just 1 line
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(1, 0, 1, 4)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _{_}->{_}_[.]_
        it('>1 lines change range is before a 1 line diagnostic range (on separate lines). Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(3, 0, 3, 4));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 1, 2, 3), 'multi-line\nreplacement');  // Change spans lines 0 to 2 and replaces with 2 lines
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(2, 0, 2, 4)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _{.}->{.}_[_]_
        it('1 line change range is before a >1 lines diagnostic range (on separate lines). Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 0, 3, 4));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 1, 0, 3), '1 line replacement');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(1, 0, 3, 4)); // ... with same range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _{.}->{_}_[_]_
        it('1 line change range is before a >1 lines diagnostic range (on separate lines). Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 0, 3, 4));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 1, 0, 3), 'multi-line\nreplacement');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(2, 0, 4, 4)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _{_}->{.}_[_]_
        it('>1 lines change range is before a >1 lines diagnostic range (on separate lines). Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(3, 0, 4, 4));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 1, 2, 3), '1 line replacement');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(1, 0, 2, 4)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _{_}->{_}_[_]_
        it('>1 lines change range is before a >1 lines diagnostic range (on separate lines). Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(3, 0, 4, 4));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 1, 2, 3), 'multi-line\nreplacement');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(2, 0, 3, 4)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _{.}->{.}.[.]_
        it('1 line change range is followed by 1 line diagnostic range (on the same line). Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(2, 5, 2, 10));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(2, 0, 2, 4), 'new');  // Change happens on line 2, from col 0 to col 4, and replaces with "new"
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(2, 4, 2, 9)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _{.}->{_}.[.]_
        it('1 line change range is followed by 1 line diagnostic range (on the same line). Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(2, 5, 2, 10));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(2, 0, 2, 4), 'multi-line\nreplacement');  // Change on line 2, replacing with multi-line text
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(3, 12, 3, 17)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _{_}->{.}.[.]_
        it('>1 lines change range is followed by 1 line diagnostic range (on the same line). Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(2, 2, 2, 5));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 5, 2, 0), 'hello');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(0, 12, 0, 15)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _{_}->{_}.[.]_
        it('>1 lines change range is followed by 1 line diagnostic range (on the same line). Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(2, 2, 2, 5));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(1, 5, 2, 1), 'three\nlines\nhere');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(3, 5, 3, 8)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _{.}->{.}.[_]_
        it('1 line change range is followed by a >1 lines diagnostic range (on the same line). Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(2, 10, 4, 2));  // Diagnostic starts at line 2, col 5
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(2, 1, 2, 6), 'new');  // Change on line 2, replacing 1 line text that is 2 chars smaller than change range
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(2, 8, 4, 2)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _{.}->{_}.[_]_
        it('1 line change range is followed by a >1 lines diagnostic range (on the same line). Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(2, 10, 4, 2));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(2, 1, 2, 6), '\n\nabc\n');  // Change on line 2, replacing 1 line text that is 2 chars smaller than change range
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(5, 4, 7, 2)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _{_}->{.}.[_]_
        it('>1 lines change range is followed by a >1 lines diagnostic range (on the same line). Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 4, 2, 5));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 2, 1, 1), '');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(0, 5, 1, 5)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _{_}->{_}.[_]_
        it('>1 lines change range is followed by a >1 lines diagnostic range (on the same line). Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 4, 2, 5));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 2, 1, 1), 'multiple\nlines');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(1, 8, 2, 5)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _{.[.}->{.}.]_
        it('1 line change range starts before a 1 line diagnostic range but ends inside the diagnostic range. Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 6, 1, 15));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(1, 2, 1, 10), 'hello world');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(1, 13, 1, 18)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _{.[.}->{_}.]_
        it('1 line change range starts before a 1 line diagnostic range but ends inside the diagnostic range. Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 6, 1, 15));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(1, 2, 1, 10), 'multi\nlines\nhere');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(3, 4, 3, 9)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _{_[.}->{.}.]_
        it('>1 lines change range starts before a 1 line diagnostic range but ends inside the diagnostic range. Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 6, 1, 15));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 2, 1, 10), 'hi');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(0, 4, 0, 9)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _{_[.}->{_}.]_
        it('>1 lines change range starts before a 1 line diagnostic range but ends inside the diagnostic range. Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 6, 1, 15));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 2, 1, 10), 'hi\nworld');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(1, 5, 1, 10)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _{_[_}->{.}.]_
        it('>1 lines change range starts before a >1 lines diagnostic range but ends inside the diagnostic range. Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 4, 3, 6));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 7, 2, 3), 'Some replacement text');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(0, 28, 1, 6)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _{.[_}->{_}.]_
        it('>1 line change range starts before a >1 lines diagnostic range but ends inside the diagnostic range. Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 4, 3, 6));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(1, 1, 3, 2), 'hello\nworld');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(2, 5, 2, 9)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _{.[.}->{.}_]_
        it('1 line change range starts before a >1 lines diagnostic range but ends inside the diagnostic range. Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 4, 3, 6));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(1, 2, 1, 15), 'great');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(1, 7, 3, 6)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _{.[.}->{_}_]_
        it('1 line change range starts before a >1 lines diagnostic range but ends inside the diagnostic range. Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 4, 3, 6));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(1, 0, 1, 15), '\n\n\n\n');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(5, 0, 7, 6)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _[.{.}->{.}.]_
        it('1 line change range is inside a 1 line diagnostic range. Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(4, 2, 4, 35));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(4, 9, 4, 9), 'extra');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(4, 2, 4, 40)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _[.{.}->{_}.]_
        it('1 line change range is inside a 1 line diagnostic range. Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(4, 2, 4, 35));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(4, 9, 4, 11), 'extra\nextra');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(4, 2, 5, 29)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _[_{.}->{.}.]_
        it('1 line change range is inside a >1 lines diagnostic range. Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(0, 0, 4, 35));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(4, 9, 4, 11), 'ok');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(0, 0, 4, 35)); // ... with the same range (only because replacement text was same size as change range) ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _[_{.}->{_}.]_
        it('1 line change range is inside a >1 lines diagnostic range. Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(0, 1, 4, 35));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(4, 9, 4, 11), 'a\nfew\nlines');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(0, 1, 6, 29)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _[.{_}->{.}.]_
        it('>1 lines change range is inside a >1 lines diagnostic range. Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(0, 1, 4, 35));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 1, 4, 11), '');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(0, 1, 0, 25)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _[.{_}->{_}.]_
        it('>1 lines change range is inside a >1 lines diagnostic range. Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(0, 1, 4, 35));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 3, 4, 11), 'some\nstuffhere');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(0, 1, 1, 33)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _[.{.].}->{.}_
        it('1 lines change range starts inside a 1 line diagnostic range but ends after it. Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(2, 2, 2, 9));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(2, 6, 2, 18), 'abc');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(2, 2, 2, 6)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _[.{.].}->{_}_
        it('1 lines change range starts inside a 1 line diagnostic range but ends after it. Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(2, 2, 2, 9));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(2, 6, 2, 18), '\nok\nok\nok\ngreat');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(2, 2, 2, 6)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _[_{.].}->{.}_
        it('1 lines change range starts inside a >1 lines diagnostic range but ends after it. Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 6, 2, 9));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(2, 0, 2, 16), '');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(1, 6, 2, 0)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _[_{.].}->{_}_
        it('1 lines change range starts inside a >1 lines diagnostic range but ends after it. Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 6, 2, 9));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(2, 0, 2, 16), '\n\nabc');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(1, 6, 2, 0)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _[.{_].}->{.}_
        it('>1 lines change range starts inside a >1 lines diagnostic range but ends after it. Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 6, 3, 6));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(2, 9, 3, 10), 'done');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(1, 6, 2, 9)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _[.{_].}->{_}_
        it('>1 lines change range starts inside a >1 lines diagnostic range but ends after it. Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(1, 6, 3, 6));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(2, 9, 3, 10), '\n\n\n');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(1, 6, 2, 9)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _[.{.]_}->{.}_
        it('>1 lines change range starts inside a 1 lines diagnostic range but ends after it. Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(0, 2, 0, 6));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 4, 4, 1), 'ok');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(0, 2, 0, 4)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _[.{.]_}->{_}_
        it('>1 lines change range starts inside a 1 lines diagnostic range but ends after it. Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(0, 2, 0, 6));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 4, 4, 1), 'multi\nline');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(0, 2, 0, 4)); // ... with fixed range ...
            expect(resultingDiags[0].isStale()).toEqual(true); // ... that should be stale
        });

        // _[.].{.}->{.}_
        it('1 line diagnostic range is followed by a change range on the same line. Replacement is 1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(0, 2, 0, 6));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 6, 0, 9), 'ok');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(0, 2, 0, 6)); // ... with same range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _[.].{.}->{.}_
        it('1 line diagnostic range is followed by a change range on the same line. Replacement is >1 line', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(0, 2, 0, 6));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 8, 0, 9), 'multi\nline');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(0, 2, 0, 6)); // ... with same range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _[.]_{_}->{_}_
        it('1 line diagnostic range is followed by a change range on a different line. Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(0, 2, 0, 6));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(1, 8, 3, 9), 'multi\nline');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([diag]); // Same diagnostic instance ...
            expect(resultingDiags[0].range).toEqual(new vscode.Range(0, 2, 0, 6)); // ... with same range ...
            expect(resultingDiags[0].isStale()).toEqual(false); // ... that should not be stale
        });

        // _{[_]}->{.}_
        it('>1 change range is exactly equal to the diag range. Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(0, 2, 1, 6));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 2, 1, 6), 'hello');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([]); // Diagnostic instance should be removed
        });

        // _{_[_]_}->{_}_
        it('>1 change range is contains within it the the diag range. Replacement is >1 lines', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri, new vscode.Range(0, 2, 1, 6));
            diagnosticManager.addDiagnostics([diag]);

            const docChangeEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEventWith(
                new vscode.Range(0, 0, 4, 0), 'hello\nworld');
            diagnosticManager.handleTextDocumentChangeEvent(docChangeEvent);

            const resultingDiags: CodeAnalyzerDiagnostic[] = diagnosticCollection.get(sampleUri) as CodeAnalyzerDiagnostic[];
            expect(resultingDiags).toEqual([]); // Diagnostic instance should be removed
        });
    });
});
