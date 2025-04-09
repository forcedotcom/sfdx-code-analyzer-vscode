/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';

/**
 * VSCode's {@code executeDocumentSymbolProvider} command can return either an
 * array of either {@link vscode.DocumentSymbol}s or {@link vscode.SymbolInformation}s.
 * This type avoids having to type out {@code vscode.DocumentSymbol | vscode.SymbolInformation}
 * repeatedly.
 */
export type GenericSymbol = vscode.DocumentSymbol | vscode.SymbolInformation;

/**
 * Class that handles interactions with the Apex Language Server.
 */
export class ApexLsp {

    /**
     * Get an array of {@link GenericSymbol}s indicating the classes, methods, etc defined
     * in the provided file.
     * @param documentUri
     * @returns An array of symbols if the server is available, otherwise empty
     */
    public static async getSymbols(documentUri: vscode.Uri): Promise<GenericSymbol[]> {
        const hierarchicalSymbols: GenericSymbol[] = (await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', documentUri)) || [];
        return flattenSymbols(hierarchicalSymbols);
    }
}

function flattenSymbols(symbols: GenericSymbol[]): GenericSymbol[] {
    const flattened: GenericSymbol[] = [];
    for (const symbol of symbols) {
        flattened.push(symbol);
        if ('children' in symbol) {
            flattened.push(...flattenSymbols(symbol.children)); // Recursively flatten children
        }
    }
    return flattened;
}
