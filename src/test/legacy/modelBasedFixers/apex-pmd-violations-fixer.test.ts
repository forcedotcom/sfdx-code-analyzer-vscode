/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import { expect } from 'chai';
import { ApexPmdViolationsFixer } from '../../../modelBasedFixers/apex-pmd-violations-fixer';
import Sinon from 'sinon';

suite('apex-pmd-violations-fixer.ts', () => {

    // Cleanup after each test
    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    suite('resolveCodeAction', () => {
        let fixer: ApexPmdViolationsFixer;

        setup(() => {
            fixer = new ApexPmdViolationsFixer();
        });

        test('should return null if cancellation is requested', async () => {
            const token = { isCancellationRequested: true } as vscode.CancellationToken;
            const codeAction = new vscode.CodeAction('Test Action', vscode.CodeActionKind.QuickFix);
            
            const result = await fixer.resolveCodeAction(codeAction, token);
            expect(result).to.equal(null);
        });
    });

    suite('extractCodeFromResponse', () => {
        let fixer: ApexPmdViolationsFixer;

        setup(() => {
            fixer = new ApexPmdViolationsFixer();
        });

        test('should extract code ending with triple ticks', () => {
            const codeWithMarkdown = '```apex\nclass TestClass {\n}\n```';
            const expectedCode = 'class TestClass {\n}';

            const result = fixer.extractCodeFromResponse(codeWithMarkdown);
            expect(result).to.equal(expectedCode);
        });

        test('should extract code ending with double ticks', () => {
            const codeWithMarkdown = '```apex\nclass TestClass {\n}\n``';
            const expectedCode = 'class TestClass {\n}';

            const result = fixer.extractCodeFromResponse(codeWithMarkdown);
            expect(result).to.equal(expectedCode);
        });

        test('should extract code ending with no new line before code', () => {
            const codeWithMarkdown = '```apexclass TestClass {\n}\n```';
            const expectedCode = 'class TestClass {\n}';

            const result = fixer.extractCodeFromResponse(codeWithMarkdown);
            expect(result).to.equal(expectedCode);
        });

        test('should extract code in the middle of instruction', () => {
            const codeWithMarkdown = '\nSome instruction here\n```apex\nclass TestClass {\n}\n```Some additional information here\n';
            const expectedCode = 'class TestClass {\n}';

            const result = fixer.extractCodeFromResponse(codeWithMarkdown);
            expect(result).to.equal(expectedCode);
        });
        test('should extract first code block when multiple code blocks are present', () => {
            const codeWithMarkdown = '\n```apex\nclass TestClass1 {\n}\n```\n```apex\nclass TestClass2 {\n}\n```\n';
            const expectedCode = 'class TestClass1 {\n}';

            const result = fixer.extractCodeFromResponse(codeWithMarkdown);
            expect(result).to.equal(expectedCode);
        });

    });

    suite('extractCodeFromFile', () => {
        let fixer: ApexPmdViolationsFixer;

        setup(() => {
            fixer = new ApexPmdViolationsFixer();
        });

        test('should extract code from given line range with OSX linebreaks', () => {
            const fileContent = 'line1\nline2\nline3\nline4';
            const result = fixer.extractCodeFromFile(fileContent, 2, 3);
            expect(result).to.equal('line2\nline3');
        });

        test('should extract code from given line range with Windows linebreaks', () => {
            const fileContent = 'line1\r\nline2\r\nline3\r\nline4';
            const result = fixer.extractCodeFromFile(fileContent, 2, 3);
            expect(result).to.equal('line2\r\nline3');
        });

        test('should extract code from given line range with pre-OSX linebreaks', () => {
            const fileContent = 'line1\rline2\rline3\rline4';
            const result = fixer.extractCodeFromFile(fileContent, 2, 3);
            expect(result).to.equal('line2\rline3');
        });

        test('should throw error for invalid line numbers', () => {
            const fileContent = 'line1\nline2\nline3';
            expect(() => fixer.extractCodeFromFile(fileContent, 0, 4))
                .to.throw('Invalid start or end line number.');
        });
    });

    suite('replaceCodeInFile', () => {
        let fixer: ApexPmdViolationsFixer;
        let fakeDocument: vscode.TextDocument;

        setup(() => {
            fixer = new ApexPmdViolationsFixer();
            fakeDocument = {
                lineAt: Sinon.stub()
            } as unknown as vscode.TextDocument;
        });

        test('should replace code while preserving indentation for a single line', () => {
            const fileContent = 'class Test {\n    void method() {\n        int x = 0\n    }\n}';
            const replaceCode = 'int x = 1;';
            (fakeDocument.lineAt as Sinon.SinonStub).callsFake((line: number) => ({
                text: fileContent.split("\n")[line]
            }));
            const result = fixer.replaceCodeInFile(fileContent, replaceCode, 3, 3, fakeDocument);
            expect(result).to.equal('class Test {\n    void method() {\n        int x = 1;\n    }\n}');
        });

        test('should replace code while preserving indentation for multiple lines', () => {
            const fileContent = 'class Test {\n    void method() {\n        // code\n    }\n}';
            const replaceCode = 'int x = 1;\nx++;\nx=10;';
            (fakeDocument.lineAt as Sinon.SinonStub).callsFake((line: number) => ({
                text: fileContent.split("\n")[line]
            }));
            const result = fixer.replaceCodeInFile(fileContent, replaceCode, 3, 3, fakeDocument);
            expect(result).to.equal('class Test {\n    void method() {\n        int x = 1;\n        x++;\n        x=10;\n    }\n}');
        });

        test('should replace code while preserving indentation for multiple lines for brackets', () => {
            const fileContent = 'class Test {\n    String soql =  [\n        // soql\n    ]\n}';
            const replaceCode = 'SELECT ID\nFROM\nACCOUNT';
            (fakeDocument.lineAt as Sinon.SinonStub).callsFake((line: number) => ({
                text: fileContent.split("\n")[line]
            }));
            const result = fixer.replaceCodeInFile(fileContent, replaceCode, 3, 3, fakeDocument);
            expect(result).to.equal('class Test {\n    String soql =  [\n        SELECT ID\n        FROM\n        ACCOUNT\n    ]\n}');
        });

        test('should replace code while preserving indentation for multiple lines for paranthesis', () => {
            const fileContent = 'class Test {\n    String soql =  (\n        // soql\n    )\n}';
            const replaceCode = 'SELECT ID\nFROM\nACCOUNT';
            (fakeDocument.lineAt as Sinon.SinonStub).callsFake((line: number) => ({
                text: fileContent.split("\n")[line]
            }));
            const result = fixer.replaceCodeInFile(fileContent, replaceCode, 3, 3, fakeDocument);
            expect(result).to.equal('class Test {\n    String soql =  (\n        SELECT ID\n        FROM\n        ACCOUNT\n    )\n}');
        });

        test('should replace code for windows', () => {
            const fileContent = 'class Test {\r\n    void method() {\r\n        // code\r\n    }\r\n}';
            const replaceCode = 'int x = 1;';
            const result = fixer.replaceCodeInFile(fileContent, replaceCode, 3, 3);
            expect(result).to.equal('class Test {\r\n    void method() {\r\nint x = 1;\r\n    }\r\n}');
        });

        test('should handle whole file replacement', () => {
            const fileContent = 'old content';
            const replaceCode = 'new content';
            const result = fixer.replaceCodeInFile(fileContent, replaceCode, 0, 2);
            expect(result).to.equal('new content');
        });

        test('should throw error for invalid line numbers', () => {
            const fileContent = 'test\ncode';
            const replaceCode = 'new';
            expect(() => fixer.replaceCodeInFile(fileContent, replaceCode, 3, 1))
                .to.throw('Invalid startLine or endLine values.');
        });
    });

    suite('isSupportedViolationForCodeFix', () => {
        let fixer: ApexPmdViolationsFixer;
    
        setup(() => {
            fixer = new ApexPmdViolationsFixer();
        });
    
        test('returns true for supported rule as object', () => {
            const diagnostic: vscode.Diagnostic = {
                code: { value: 'ApexCRUDViolation' }
            } as vscode.Diagnostic;
    
            const result = fixer.isSupportedViolationForCodeFix(diagnostic);
            expect(result).to.equal(true);
        });
    
        test('returns true for supported rule as string', () => {
            const diagnostic: vscode.Diagnostic = {
                code: 'ApexCRUDViolation'
            } as vscode.Diagnostic;
    
            const result = fixer.isSupportedViolationForCodeFix(diagnostic);
            expect(result).to.equal(false);
        });
    
        test('returns false for unsupported rule', () => {
            const diagnostic: vscode.Diagnostic = {
                code: { value: 'unsupportedRule' }
            } as vscode.Diagnostic;
    
            const result = fixer.isSupportedViolationForCodeFix(diagnostic);
            expect(result).to.equal(false);
        });
    
        test('returns false for diagnostic without code', () => {
            const diagnostic: vscode.Diagnostic = {} as vscode.Diagnostic;
    
            const result = fixer.isSupportedViolationForCodeFix(diagnostic);
            expect(result).to.equal(false);
        });
    });

    suite('removeDiagnosticsWithInRange', () => {
        let fixer: ApexPmdViolationsFixer;
        let diagnosticCollection: vscode.DiagnosticCollection;
        let uri: vscode.Uri;

        setup(() => {
            fixer = new ApexPmdViolationsFixer();
            diagnosticCollection = vscode.languages.createDiagnosticCollection();
            uri = vscode.Uri.file('test.apex');
        });

        teardown(() => {
            diagnosticCollection.clear();
        });

        test('should remove diagnostics that overlap with the given range', () => {
            const diagnostics: vscode.Diagnostic[] = [
                new vscode.Diagnostic(new vscode.Range(2, 0, 4, 10), 'Overlapping diagnostic'),
                new vscode.Diagnostic(new vscode.Range(5, 0, 6, 10), 'Non-overlapping diagnostic')
            ];
            diagnostics[0].code = { value: 'ApexCRUDViolation', target: uri };
            diagnostics[1].code = { value: 'ApexCRUDViolation', target: uri };
            diagnosticCollection.set(uri, diagnostics);

            fixer.removeDiagnosticsWithInRange(uri, new vscode.Range(3, 0, 4, 10), diagnosticCollection);

            const updatedDiagnostics = diagnosticCollection.get(uri) || [];
            expect(updatedDiagnostics).to.have.lengthOf(1);
            expect(updatedDiagnostics[0].message).to.equal('Non-overlapping diagnostic');
        });

        test('should retain diagnostics that do not overlap with the given range', () => {
            const diagnostics: vscode.Diagnostic[] = [
                new vscode.Diagnostic(new vscode.Range(0, 0, 1, 10), 'Non-overlapping diagnostic 1'),
                new vscode.Diagnostic(new vscode.Range(5, 0, 6, 10), 'Non-overlapping diagnostic 2')
            ];
            diagnostics[0].code = { value: 'ApexCRUDViolation', target: uri };
            diagnostics[1].code = { value: 'ApexCRUDViolation', target: uri };
            diagnosticCollection.set(uri, diagnostics);

            fixer.removeDiagnosticsWithInRange(uri, new vscode.Range(2, 0, 3, 10), diagnosticCollection);

            const updatedDiagnostics = diagnosticCollection.get(uri) || [];
            expect(updatedDiagnostics).to.have.lengthOf(2);
        });

        test('should not remove diagnostics with code not A4D_FIX_AVAILABLE_RULES', () => {
            const diagnostics: vscode.Diagnostic[] = [
                new vscode.Diagnostic(new vscode.Range(2, 0, 4, 10), 'Overlapping diagnostic', vscode.DiagnosticSeverity.Warning),
                new vscode.Diagnostic(new vscode.Range(5, 0, 6, 10), 'Non-overlapping diagnostic', vscode.DiagnosticSeverity.Warning)
            ];
            diagnostics[0].code = { value: 'SomeOtherViolation', target: uri };
            diagnostics[1].code = { value: 'SomeOtherViolation', target: uri };

            diagnosticCollection.set(uri, diagnostics);

            fixer.removeDiagnosticsWithInRange(uri, new vscode.Range(3, 0, 4, 10), diagnosticCollection);

            const updatedDiagnostics = diagnosticCollection.get(uri) || [];
            expect(updatedDiagnostics).to.have.lengthOf(2);
        });

        test('should do nothing if no diagnostics exist for the URI', () => {
            fixer.removeDiagnosticsWithInRange(uri, new vscode.Range(2, 0, 4, 10), diagnosticCollection);

            const updatedDiagnostics = diagnosticCollection.get(uri);
            expect(updatedDiagnostics).to.have.lengthOf(0);
        });

        test('should handle single-line overlaps correctly', () => {
            const diagnostics: vscode.Diagnostic[] = [
                new vscode.Diagnostic(new vscode.Range(3, 0, 3, 10), 'Single-line diagnostic'),
                new vscode.Diagnostic(new vscode.Range(5, 0, 6, 10), 'Non-overlapping diagnostic')
            ];
            diagnostics[0].code = { value: 'ApexCRUDViolation', target: uri };
            diagnostics[1].code = { value: 'ApexCRUDViolation', target: uri };
            diagnosticCollection.set(uri, diagnostics);

            fixer.removeDiagnosticsWithInRange(uri, new vscode.Range(3, 0, 3, 10), diagnosticCollection);

            const updatedDiagnostics = diagnosticCollection.get(uri) || [];
            expect(updatedDiagnostics).to.have.lengthOf(1);
            expect(updatedDiagnostics[0].message).to.equal('Non-overlapping diagnostic');
        });
    });
});