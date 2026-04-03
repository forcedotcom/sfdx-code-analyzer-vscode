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

        it('When multi-line fixedCode replaces full lines (char 0), then indentation normalization is applied', () => {
            // Simulates A4D fix: "for without braces" → adds braces (1 line becomes 3 lines)
            const content: string =
                `function example() {\n` +
                `    for (Integer i = 0; i < 10; i++)\n` +
                `        System.debug(i);\n` +
                `    return;\n` +
                `}`;
            const document: vscode.TextDocument = createTextDocument(sampleUri, content, 'apex');

            // Range covers both lines fully (line 1 char 0 to line 2 end)
            const range: vscode.Range = new vscode.Range(1, 0, 2, 26);
            const codeFixData: CodeFixData = {
                document: document,
                diagnostic: {} as vscode.Diagnostic,
                rangeToBeFixed: range,
                fixedCode: '    for (Integer i = 0; i < 10; i++) {\n        System.debug(i);\n    }'
            };

            const fixSuggestion: FixSuggestion = new FixSuggestion(codeFixData);
            const result: string = fixSuggestion.getFixedDocumentCode();

            expect(result).toEqual(
                `function example() {\n` +
                `    for (Integer i = 0; i < 10; i++) {\n` +
                `        System.debug(i);\n` +
                `    }\n` +
                `    return;\n` +
                `}`
            );
        });

        it('When multi-line fixedCode with partial range has proper indentation, then it is spliced in correctly', () => {
            // Simulates: replacing a function call with a multi-line version
            // fixedCode already has the correct absolute indentation
            const content: string =
                `function example() {\n` +
                `    const x = singleCall(arg1);\n` +
                `    return x;\n` +
                `}`;
            const document: vscode.TextDocument = createTextDocument(sampleUri, content, 'apex');

            // Range covers "singleCall(arg1)" on line 1 (chars 14 to 30)
            const range: vscode.Range = new vscode.Range(1, 14, 1, 30);
            const codeFixData: CodeFixData = {
                document: document,
                diagnostic: {} as vscode.Diagnostic,
                rangeToBeFixed: range,
                fixedCode: 'multiCall(\n        arg1,\n        arg2\n    )'
            };

            const fixSuggestion: FixSuggestion = new FixSuggestion(codeFixData);
            const result: string = fixSuggestion.getFixedDocumentCode();

            // beforeText="    const x = ", afterText=";", fixedCode used raw (partial range)
            // The fixedCode's internal newlines are preserved as-is
            expect(result).toEqual(
                `function example() {\n` +
                `    const x = multiCall(\n` +
                `        arg1,\n` +
                `        arg2\n` +
                `    );\n` +
                `    return x;\n` +
                `}`
            );
        });

        it('When single line is expanded to multiple lines via full-line range, then indentation is normalized', () => {
            // Simulates: OneDeclarationPerLine fix (1 line → 3 lines)
            const content: string =
                `function example() {\n` +
                `    Integer a, b, c;\n` +
                `    return a;\n` +
                `}`;
            const document: vscode.TextDocument = createTextDocument(sampleUri, content, 'apex');

            // Range covers entire line 1 ("    Integer a, b, c;" = 20 chars)
            const range: vscode.Range = new vscode.Range(1, 0, 1, 20);
            const codeFixData: CodeFixData = {
                document: document,
                diagnostic: {} as vscode.Diagnostic,
                rangeToBeFixed: range,
                fixedCode: '    Integer a;\n    Integer b;\n    Integer c;'
            };

            const fixSuggestion: FixSuggestion = new FixSuggestion(codeFixData);
            const result: string = fixSuggestion.getFixedDocumentCode();

            expect(result).toEqual(
                `function example() {\n` +
                `    Integer a;\n` +
                `    Integer b;\n` +
                `    Integer c;\n` +
                `    return a;\n` +
                `}`
            );
        });

        it('When multiple lines are collapsed to single line, then surrounding text is preserved', () => {
            // Simulates: collapsing a multi-line expression into one line
            const content: string =
                `function example() {\n` +
                `    const result = someCall(\n` +
                `        arg1,\n` +
                `        arg2\n` +
                `    );\n` +
                `    return result;\n` +
                `}`;
            const document: vscode.TextDocument = createTextDocument(sampleUri, content, 'apex');

            // Range covers lines 1-4 fully (char 0)
            const range: vscode.Range = new vscode.Range(1, 0, 4, 6);
            const codeFixData: CodeFixData = {
                document: document,
                diagnostic: {} as vscode.Diagnostic,
                rangeToBeFixed: range,
                fixedCode: '    const result = someCall(arg1, arg2);'
            };

            const fixSuggestion: FixSuggestion = new FixSuggestion(codeFixData);
            const result: string = fixSuggestion.getFixedDocumentCode();

            expect(result).toEqual(
                `function example() {\n` +
                `    const result = someCall(arg1, arg2);\n` +
                `    return result;\n` +
                `}`
            );
        });

        it('When multi-line fixedCode replaces a partial multi-line range, then before/after text is preserved', () => {
            // Range starts and ends mid-line, fixedCode spans multiple lines
            const content: string =
                `line0 content\n` +
                `prefix START_REPLACE\n` +
                `END_REPLACE suffix\n` +
                `line3 content`;
            const document: vscode.TextDocument = createTextDocument(sampleUri, content, 'apex');

            // Range from line 1 char 7 to line 2 char 11
            const range: vscode.Range = new vscode.Range(1, 7, 2, 11);
            const codeFixData: CodeFixData = {
                document: document,
                diagnostic: {} as vscode.Diagnostic,
                rangeToBeFixed: range,
                fixedCode: 'FIXED_LINE_1\nFIXED_LINE_2\nFIXED_LINE_3'
            };

            const fixSuggestion: FixSuggestion = new FixSuggestion(codeFixData);
            const result: string = fixSuggestion.getFixedDocumentCode();

            // beforeText="prefix ", afterText=" suffix", fixedCode used raw (partial range)
            // Result: "prefix " + "FIXED_LINE_1\nFIXED_LINE_2\nFIXED_LINE_3" + " suffix"
            expect(result).toEqual(
                `line0 content\n` +
                `prefix FIXED_LINE_1\n` +
                `FIXED_LINE_2\n` +
                `FIXED_LINE_3 suffix\n` +
                `line3 content`
            );
        });

        it('When empty fixedCode with full-line range (char 0), then the line content is removed but whitespace may remain', () => {
            const content: string =
                `line0\n` +
                `    removable line\n` +
                `line2`;
            const document: vscode.TextDocument = createTextDocument(sampleUri, content, 'apex');

            // Range covers entire line 1 starting at char 0
            const range: vscode.Range = new vscode.Range(1, 0, 1, 18);
            const codeFixData: CodeFixData = {
                document: document,
                diagnostic: {} as vscode.Diagnostic,
                rangeToBeFixed: range,
                fixedCode: ''
            };

            const fixSuggestion: FixSuggestion = new FixSuggestion(codeFixData);
            const result: string = fixSuggestion.getFixedDocumentCode();

            // char 0 path → getFixedCode() which normalizes indentation:
            // fixedCode="" → fixedLines=[""] → commonIndentation="" → trimmedFixedLines=[""]
            // originalLineAtStartOfFix="    removable line" → indentation="    "
            // indentToAdd = removeSuffix("    ", "") = "    "
            // getFixedCode() returns "    " (just whitespace)
            // beforeText="" + "    " + afterText="" = "    "
            expect(result).toEqual(
                `line0\n` +
                `    \n` +
                `line2`
            );
        });

        it('When document uses CRLF line endings (Windows), then fixed code preserves CRLF', () => {
            const content: string =
                `line0 content\r\n` +
                `prefix REPLACE_ME suffix\r\n` +
                `line2 content`;
            const document: vscode.TextDocument = createTextDocument(sampleUri, content, 'apex');
            // Override EOL to CRLF
            Object.defineProperty(document, 'eol', { value: vscode.EndOfLine.CRLF, writable: false });

            const range: vscode.Range = new vscode.Range(1, 7, 1, 17);
            const codeFixData: CodeFixData = {
                document: document,
                diagnostic: {} as vscode.Diagnostic,
                rangeToBeFixed: range,
                fixedCode: 'FIXED'
            };

            const fixSuggestion: FixSuggestion = new FixSuggestion(codeFixData);
            const result: string = fixSuggestion.getFixedDocumentCode();

            // Result should use \r\n line endings
            expect(result).toEqual(
                `line0 content\r\n` +
                `prefix FIXED suffix\r\n` +
                `line2 content`
            );
        });

        it('When document uses tab indentation, then fixed code preserves tabs', () => {
            const content: string =
                `function example() {\n` +
                `\tvar myVariable = "hello";\n` +
                `\treturn myVariable;\n` +
                `}`;
            const document: vscode.TextDocument = createTextDocument(sampleUri, content, 'javascript');

            // Range covers just "var" (line 1, chars 1 to 4, after tab)
            const range: vscode.Range = new vscode.Range(1, 1, 1, 4);
            const codeFixData: CodeFixData = {
                document: document,
                diagnostic: {} as vscode.Diagnostic,
                rangeToBeFixed: range,
                fixedCode: 'const'
            };

            const fixSuggestion: FixSuggestion = new FixSuggestion(codeFixData);
            const result: string = fixSuggestion.getFixedDocumentCode();

            // Result should preserve tab character
            expect(result).toEqual(
                `function example() {\n` +
                `\tconst myVariable = "hello";\n` +
                `\treturn myVariable;\n` +
                `}`
            );
        });

        it('When document contains multi-byte characters (emoji, unicode), then positions are calculated correctly', () => {
            const content: string =
                `function test() {\n` +
                `    const message = "Hello 🚀 REPLACE_ME World 中文";\n` +
                `    return message;\n` +
                `}`;
            const document: vscode.TextDocument = createTextDocument(sampleUri, content, 'javascript');

            // Range covers "REPLACE_ME" which comes after emoji
            // Note: Emoji 🚀 is a surrogate pair, taking 2 UTF-16 code units
            // Character positions in line: "    const message = "Hello 🚀 REPLACE_ME..."
            // REPLACE_ME starts at char 30 (after indentation, const, =, ", Hello, 🚀, space)
            const range: vscode.Range = new vscode.Range(1, 30, 1, 40);
            const codeFixData: CodeFixData = {
                document: document,
                diagnostic: {} as vscode.Diagnostic,
                rangeToBeFixed: range,
                fixedCode: 'FIXED'
            };

            const fixSuggestion: FixSuggestion = new FixSuggestion(codeFixData);
            const result: string = fixSuggestion.getFixedDocumentCode();

            // Multi-byte characters before and after the replacement should be preserved
            expect(result).toEqual(
                `function test() {\n` +
                `    const message = "Hello 🚀 FIXED World 中文";\n` +
                `    return message;\n` +
                `}`
            );
        });

        it('When multi-line fixedCode with tabs replaces full-line range, then tab indentation is normalized', () => {
            const content: string =
                `function example() {\n` +
                `\tfor (Integer i = 0; i < 10; i++)\n` +
                `\t\tSystem.debug(i);\n` +
                `\treturn;\n` +
                `}`;
            const document: vscode.TextDocument = createTextDocument(sampleUri, content, 'apex');

            // Range covers both lines fully (line 1 char 0 to line 2 end)
            const range: vscode.Range = new vscode.Range(1, 0, 2, 19);
            const codeFixData: CodeFixData = {
                document: document,
                diagnostic: {} as vscode.Diagnostic,
                rangeToBeFixed: range,
                // fixedCode has tabs (matching original indentation style)
                fixedCode: '\tfor (Integer i = 0; i < 10; i++) {\n\t\tSystem.debug(i);\n\t}'
            };

            const fixSuggestion: FixSuggestion = new FixSuggestion(codeFixData);
            const result: string = fixSuggestion.getFixedDocumentCode();

            // Tabs should be preserved in both original and fixed code
            expect(result).toEqual(
                `function example() {\n` +
                `\tfor (Integer i = 0; i < 10; i++) {\n` +
                `\t\tSystem.debug(i);\n` +
                `\t}\n` +
                `\treturn;\n` +
                `}`
            );
        });
    });
});
