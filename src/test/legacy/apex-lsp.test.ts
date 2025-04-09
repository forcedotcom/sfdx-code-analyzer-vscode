/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as Sinon from 'sinon';
import {expect} from 'chai';
import * as vscode from 'vscode';
import { ApexLsp } from '../../lib/apex-lsp';

suite('ScanRunner', () => {
    let executeCommandStub: Sinon.SinonStub;

    setup(() => {
        executeCommandStub = Sinon.stub(vscode.commands, 'executeCommand');
    });

    teardown(() => {
        executeCommandStub.restore();
    });

    test('Should call vscode.executeDocumentSymbolProvider with the correct documentUri and return the symbols', async () => {
        const dummyRange: vscode.Range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1));
        const documentUri = vscode.Uri.file('test.cls');
        const childSymbol: vscode.DocumentSymbol = new vscode.DocumentSymbol(
            'MethodName',
            'some Method',
            vscode.SymbolKind.Method,
            dummyRange,
            dummyRange); 

        const parentSymbol: vscode.DocumentSymbol = new vscode.DocumentSymbol(
            'ClassName',
            'Name of Class',
            vscode.SymbolKind.Class,
            dummyRange,
            dummyRange
        );
        parentSymbol.children = [childSymbol];

        const symbols: vscode.DocumentSymbol[] = [parentSymbol];

        executeCommandStub.resolves(symbols);

        const result = await ApexLsp.getSymbols(documentUri);

        expect(executeCommandStub.calledOnceWith('vscode.executeDocumentSymbolProvider', documentUri)).to.equal(true);

        expect(result).to.deep.equal([parentSymbol, childSymbol]); // Should be flat
    });
});
