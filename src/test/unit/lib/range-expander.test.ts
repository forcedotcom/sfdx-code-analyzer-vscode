import * as vscode from "vscode";
import {createTextDocument} from "jest-mock-vscode";
import {RangeExpander} from "../../../lib/range-expander";

describe('Tests for the RangeExpander class', () => {
    const sampleContent: string =
        '// Some comment\n' +
        'protected class HelloWorld {\n' +
        '    void someMethod1() {\n' +
        '        System.debug(\'hello world\');\n' +
        '    } /* a comment */\n' +
        '    void someMethod2() {}\n' +
        '    public class InnerClass {\n' +
        '       // nothing\n' +
        '    }\n' +
        ' \n' +
        '}\n' +
        '// comment afterwards';
    const sampleDocument: vscode.TextDocument = createTextDocument(vscode.Uri.file('dummy.cls'), sampleContent, 'apex');
    const rangeExpander: RangeExpander = new RangeExpander(sampleDocument);

    describe('Tests for expandToCompleteLines', ()=> {
        it('When input range is part of single line, we return that full single line range', () => {
            const expandedRange: vscode.Range = rangeExpander.expandToCompleteLines(new vscode.Range(2, 4, 2, 8));
            expect(expandedRange).toEqual(new vscode.Range(2, 0, 2, 24));
        });

        it('When input range spans multiple lines, then we complete those lines', () => {
            const expandedRange: vscode.Range = rangeExpander.expandToCompleteLines(new vscode.Range(2, 9, 3, 1));
            expect(expandedRange).toEqual(new vscode.Range(2, 0, 3, 36));
        });
    });

    describe('Tests for expandToMethod', ()=> {
        it('When input range is within a method, then correctly expand range to the method', () => {
            const expandedRange: vscode.Range = rangeExpander.expandToMethod(new vscode.Range(3, 4, 3, 8));
            expect(expandedRange).toEqual(new vscode.Range(2, 0, 4, 21));
        });

        it('When input range is just a method name, then get entire method', () => {
            const expandedRange: vscode.Range = rangeExpander.expandToMethod(new vscode.Range(5, 9, 5, 20));
            expect(expandedRange).toEqual(new vscode.Range(5, 0, 5, 25));
        });

        it('When input range is after but on the same line as the end of a method, then get entire method', () => {
            const expandedRange: vscode.Range = rangeExpander.expandToMethod(new vscode.Range(4, 9, 4, 13));
            expect(expandedRange).toEqual(new vscode.Range(2, 0, 4, 21));
        });

        it('When input range is not on a line with a method, then get the class range', () => {
            const expandedRange: vscode.Range = rangeExpander.expandToMethod(new vscode.Range(6, 0, 6, 1));
            expect(expandedRange).toEqual(new vscode.Range(6, 0, 8, 5));
        });

        it('When the start of an input range is within a method but the end is not, then get the class range', () => {
            const expandedRange: vscode.Range = rangeExpander.expandToMethod(new vscode.Range(5, 5, 6, 1));
            expect(expandedRange).toEqual(new vscode.Range(1, 0, 10, 1));
        });

        it('When the end of an input range is within a method but the start is not, then get the class range', () => {
            const expandedRange: vscode.Range = rangeExpander.expandToMethod(new vscode.Range(1, 2, 4, 5));
            expect(expandedRange).toEqual(new vscode.Range(1, 0, 10, 1));
        });
    });

    describe('Tests for expandToClass', ()=> {
        it('When input range is within method, then correctly expand range to the class', () => {
            const expandedRange: vscode.Range = rangeExpander.expandToClass(new vscode.Range(3, 4, 3, 8));
            expect(expandedRange).toEqual(new vscode.Range(1, 0, 10, 1));
        });

        it('When input range is an inner class, then correctly expand range to that inner class', () => {
            const expandedRange: vscode.Range = rangeExpander.expandToClass(new vscode.Range(7, 2, 7, 11));
            expect(expandedRange).toEqual(new vscode.Range(6, 0, 8, 5));
        });

        it('When input range starts in inner class but ends outside of inner class, then just keep that inner class range plus the extra lines', () => {
            // Note we may decide in the future that this isn't good enough, and instead we want the entire outer class,
            // but that'll take more work to implement, so I think this edge case scenario is good enough for now.
            const expandedRange: vscode.Range = rangeExpander.expandToClass(new vscode.Range(7, 2, 9, 0));
            expect(expandedRange).toEqual(new vscode.Range(6, 0, 9, 1));
        });

        it('When input range starts before an class but ends inside of inner class, then expand to outer class', () => {
            const expandedRange: vscode.Range = rangeExpander.expandToClass(new vscode.Range(3, 2, 7, 0));
            expect(expandedRange).toEqual(new vscode.Range(1, 0, 10, 1));
        });

        it('When input range is entirely before the outer class, then return the class including the preceding lines', () => {
            const expandedRange: vscode.Range = rangeExpander.expandToClass(new vscode.Range(0, 1, 0, 4));
            expect(expandedRange).toEqual(new vscode.Range(0, 0, 10, 1));
        });

        it('When input range is entirely after the outer class, then return the class including the succeeding lines', () => {
            const expandedRange: vscode.Range = rangeExpander.expandToClass(new vscode.Range(11, 1, 11, 4));
            expect(expandedRange).toEqual(new vscode.Range(1, 0, 11, 21));
        });
    });
});
