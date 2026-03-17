import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts

import { createTextDocument } from "jest-mock-vscode";
import { FixSuggestion, CodeFixData } from "../../src/lib/fix-suggestion";

describe('Tests for the FixSuggestion class', () => {
    const sampleUri: vscode.Uri = vscode.Uri.file('/someFile.cls');

    describe('tests for the getFixedDocumentCode method', () => {
        it('When range covers a partial single line, then only the range portion is replaced', () => {
            const content: string =
                `line0 content\n` +
                `line1 prefix REPLACE_ME line1 suffix\n` +
                `line2 content`;
            const document: vscode.TextDocument = createTextDocument(sampleUri, content, 'apex');

            // Range covers just "REPLACE_ME" on line 1 (0-based: line 1, chars 13 to 23)
            const range: vscode.Range = new vscode.Range(1, 13, 1, 23);
            const codeFixData: CodeFixData = {
                document: document,
                diagnostic: {} as vscode.Diagnostic,
                rangeToBeFixed: range,
                fixedCode: 'FIXED'
            };

            const fixSuggestion: FixSuggestion = new FixSuggestion(codeFixData);
            const result: string = fixSuggestion.getFixedDocumentCode();

            expect(result).toEqual(
                `line0 content\n` +
                `line1 prefix FIXED line1 suffix\n` +
                `line2 content`
            );
        });

        it('When range spans multiple lines partially, then text before start and after end is preserved', () => {
            const content: string =
                `line0 content\n` +
                `line1 start REPLACE\n` +
                `MIDDLE LINE\n` +
                `END_REPLACE line3 end\n` +
                `line4 content`;
            const document: vscode.TextDocument = createTextDocument(sampleUri, content, 'apex');

            // Range from line 1 char 12 to line 3 char 11
            const range: vscode.Range = new vscode.Range(1, 12, 3, 11);
            const codeFixData: CodeFixData = {
                document: document,
                diagnostic: {} as vscode.Diagnostic,
                rangeToBeFixed: range,
                fixedCode: 'FIXED_CODE'
            };

            const fixSuggestion: FixSuggestion = new FixSuggestion(codeFixData);
            const result: string = fixSuggestion.getFixedDocumentCode();

            expect(result).toEqual(
                `line0 content\n` +
                `line1 start FIXED_CODE line3 end\n` +
                `line4 content`
            );
        });

        it('When range starts at beginning of line and ends at end of line, then entire lines are replaced', () => {
            const content: string =
                `line0\n` +
                `line1 to replace\n` +
                `line2`;
            const document: vscode.TextDocument = createTextDocument(sampleUri, content, 'apex');

            // Range covers entire line 1
            const range: vscode.Range = new vscode.Range(1, 0, 1, 16);
            const codeFixData: CodeFixData = {
                document: document,
                diagnostic: {} as vscode.Diagnostic,
                rangeToBeFixed: range,
                fixedCode: 'line1 replaced'
            };

            const fixSuggestion: FixSuggestion = new FixSuggestion(codeFixData);
            const result: string = fixSuggestion.getFixedDocumentCode();

            expect(result).toEqual(
                `line0\n` +
                `line1 replaced\n` +
                `line2`
            );
        });

        it('When range is at the very beginning of the document, then replacement works correctly', () => {
            const content: string =
                `REPLACE_THIS rest of line\n` +
                `line1 content`;
            const document: vscode.TextDocument = createTextDocument(sampleUri, content, 'apex');

            const range: vscode.Range = new vscode.Range(0, 0, 0, 12);
            const codeFixData: CodeFixData = {
                document: document,
                diagnostic: {} as vscode.Diagnostic,
                rangeToBeFixed: range,
                fixedCode: 'FIXED'
            };

            const fixSuggestion: FixSuggestion = new FixSuggestion(codeFixData);
            const result: string = fixSuggestion.getFixedDocumentCode();

            expect(result).toEqual(
                `FIXED rest of line\n` +
                `line1 content`
            );
        });

        it('When range is at the end of the document, then replacement works correctly', () => {
            const content: string =
                `line0 content\n` +
                `prefix REPLACE_THIS`;
            const document: vscode.TextDocument = createTextDocument(sampleUri, content, 'apex');

            const range: vscode.Range = new vscode.Range(1, 7, 1, 19);
            const codeFixData: CodeFixData = {
                document: document,
                diagnostic: {} as vscode.Diagnostic,
                rangeToBeFixed: range,
                fixedCode: 'FIXED'
            };

            const fixSuggestion: FixSuggestion = new FixSuggestion(codeFixData);
            const result: string = fixSuggestion.getFixedDocumentCode();

            expect(result).toEqual(
                `line0 content\n` +
                `prefix FIXED`
            );
        });

        it('When fixedCode is empty, then the range is simply removed', () => {
            const content: string =
                `line0\n` +
                `prefix REMOVE_ME suffix\n` +
                `line2`;
            const document: vscode.TextDocument = createTextDocument(sampleUri, content, 'apex');

            const range: vscode.Range = new vscode.Range(1, 7, 1, 16);
            const codeFixData: CodeFixData = {
                document: document,
                diagnostic: {} as vscode.Diagnostic,
                rangeToBeFixed: range,
                fixedCode: ''
            };

            const fixSuggestion: FixSuggestion = new FixSuggestion(codeFixData);
            const result: string = fixSuggestion.getFixedDocumentCode();

            expect(result).toEqual(
                `line0\n` +
                `prefix  suffix\n` +
                `line2`
            );
        });

        it('When fixedCode replaces a single word mid-line (like var to const), then only that word is replaced', () => {
            const content: string =
                `function example() {\n` +
                `    var myVariable = "hello";\n` +
                `    return myVariable;\n` +
                `}`;
            const document: vscode.TextDocument = createTextDocument(sampleUri, content, 'javascript');

            // Range covers just "var" (line 1, chars 4 to 7)
            const range: vscode.Range = new vscode.Range(1, 4, 1, 7);
            const codeFixData: CodeFixData = {
                document: document,
                diagnostic: {} as vscode.Diagnostic,
                rangeToBeFixed: range,
                fixedCode: 'const'
            };

            const fixSuggestion: FixSuggestion = new FixSuggestion(codeFixData);
            const result: string = fixSuggestion.getFixedDocumentCode();

            expect(result).toEqual(
                `function example() {\n` +
                `    const myVariable = "hello";\n` +
                `    return myVariable;\n` +
                `}`
            );
        });
    });
});
