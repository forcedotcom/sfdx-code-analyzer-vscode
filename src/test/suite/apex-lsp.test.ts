/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import Sinon = require('sinon');
import {expect} from 'chai';
import * as vscode from 'vscode';
import { ApexLsp } from '../../lib/apex-lsp';

suite('ScanRunner', () => {
    let executeCommandStub: sinon.SinonStub;

    setup(() => {
        executeCommandStub = Sinon.stub(vscode.commands, 'executeCommand');
    });

    teardown(() => {
        executeCommandStub.restore();
    });

    test('Should call vscode.executeDocumentSymbolProvider with the correct documentUri and return the symbols', async () => {
        const documentUri = vscode.Uri.file('test.cls');
        const symbols: vscode.DocumentSymbol[] = [
            new vscode.DocumentSymbol(
            'Some Class',
            'Test Class',
            vscode.SymbolKind.Class,
            new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
            new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1))
            )
        ];

        executeCommandStub.resolves(symbols);

        const result = await ApexLsp.getSymbols(documentUri);

        expect(executeCommandStub.calledOnceWith('vscode.executeDocumentSymbolProvider', documentUri)).to.be.true;
        expect(result).to.deep.equal(symbols);
    });
});