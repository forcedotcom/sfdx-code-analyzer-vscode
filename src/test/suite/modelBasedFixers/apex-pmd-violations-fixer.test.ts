/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import { expect } from 'chai';
import { ApexPmdViolationsFixer } from '../../../modelBasedFixers/apex-pmd-violations-fixer';

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
            expect(result).to.be.null;
        });

        test('should handle code snippet markdown removal', () => {
            const codeWithMarkdown = '```apex\nclass TestClass {\n}\n```';
            const expectedCode = '\nclass TestClass {\n}\n';
            
            const result = fixer.removeCodeMarkdowns(codeWithMarkdown);
            expect(result).to.equal(expectedCode);
        });
    });

    suite('extractCodeFromFile', () => {
        let fixer: ApexPmdViolationsFixer;

        setup(() => {
            fixer = new ApexPmdViolationsFixer();
        });

        test('should extract code from given line range', () => {
            const fileContent = 'line1\nline2\nline3\nline4';
            const result = fixer.extractCodeFromFile(fileContent, 2, 3);
            expect(result).to.equal('line2\nline3');
        });

        test('should throw error for invalid line numbers', () => {
            const fileContent = 'line1\nline2\nline3';
            expect(() => fixer.extractCodeFromFile(fileContent, 0, 4))
                .to.throw('Invalid start or end line number.');
        });
    });

    suite('replaceCodeInFile', () => {
        let fixer: ApexPmdViolationsFixer;

        setup(() => {
            fixer = new ApexPmdViolationsFixer();
        });

        test('should replace code while preserving indentation', () => {
            const fileContent = 'class Test {\n    void method() {\n        // code\n    }\n}';
            const replaceCode = 'int x = 1;';
            const result = fixer.replaceCodeInFile(fileContent, replaceCode, 3, 3);
            expect(result).to.equal('class Test {\n    void method() {\n        int x = 1;\n    }\n}');
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
});