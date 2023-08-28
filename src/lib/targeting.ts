/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';
import globby = require('globby');
import {exists, isDir} from './file';
import {ApexLsp, GenericSymbol} from './apex-lsp';
import {messages} from './messages';

/**
 * Identifies all targeted files or directories based on either manual
 * selection by the user or by contextual determination of the currently open file.
 * @param selections The URIs of files that have been manually selected.
 * @returns Paths of targeted files.
 * @throws If no files are selected and no file is open in the editor.
 */
export async function getTargets(selections: vscode.Uri[]): Promise<string[]> {
    // If files/folders were selected, we should use those.
    if (selections && selections.length > 0) {
        // Use a Set to preserve uniqueness.
        const targets: Set<string> = new Set();
        for (const selection of selections) {
            if (!(await exists(selection.fsPath))) {
                // This should never happen, but we should handle it gracefully regardless.
                throw new Error(messages.targeting.error.nonexistentSelectedFileGenerator(selection.fsPath));
            } else if (await isDir(selection.fsPath)) {
				// Globby wants forward-slashes, but Windows uses back-slashes, so we need to convert the
				// latter into the former.
				const globbablePath = selection.fsPath.replace(/\\/g, '/');
                const globOut: string[] = await globby(`${globbablePath}/**/*`);
				// Globby's results are Unix-formatted. Do a Uri.file roundtrip to return the path
				// to its expected form.
                globOut.forEach(o => targets.add(vscode.Uri.file(o).fsPath));
            } else {
                targets.add(selection.fsPath);
            }
        }
        return [...targets];
    } else if (vscode.window.activeTextEditor) {
        // In the absence of a command arg, use whatever file is currently
        // open in the editor.
        return [vscode.window.activeTextEditor.document.fileName];
    } else {
        // If there's no file open in the editor, throw an error indicating that
        // we're not sure what to scan.
        // TODO: Potentially enhancement is to default to root of workspace.
        // TODO: Experiment with keybindings and automated args?
        throw new Error(messages.targeting.error.noFileSelected);
    }
}

/**
 * Identifies the method the user has clicked on.
 * If the Apex Language Server is available, then it will be used to identify the method
 * immediately preceding the cursor's position.
 * Otherwise, the word the user clicked on is assumed to be the name of the method.
 * @returns A Graph-Engine compatible method-level target based on the method the user selected.
 * @throws If a method could not be identified.
 */
export async function getSelectedMethod(): Promise<string> {
    // Get the editor.
    const activeEditor: vscode.TextEditor = vscode.window.activeTextEditor;
    // If there's nothing open in the editor, we can't do anything. So just throw an error.
    if (!activeEditor) {
        throw new Error(messages.targeting.error.noFileSelected);
    }

    // Get the document in the editor, and the cursor's position within it.
    const textDocument: vscode.TextDocument = activeEditor.document;
    const cursorPosition: vscode.Position = activeEditor.selection.active;

	// The filename-portion of the target string needs to be Unix-formatted,
	// otherwise it will parse as a glob and kill the process.
	const fileName: string = textDocument.fileName.replace(/\\/g, '/');

    // If the Apex Language Server is available, we can use it to derive much more robust
    // targeting information than we can independently.
    const symbols: GenericSymbol[] = await ApexLsp.getSymbols(textDocument.uri);
    if (symbols && symbols.length > 0) {
        const nearestMethodSymbol: GenericSymbol = getNearestMethodSymbol(symbols, cursorPosition);
        // If we couldn't find a method, throw an error.
        if (!nearestMethodSymbol) {
            throw new Error(messages.targeting.error.noMethodIdentified);
        }
        // The symbol's name property is the method signature, so we want to lop off everything
        // after the first open-paren.
        const methodSignature: string = nearestMethodSymbol.name;
        return `${fileName}#${methodSignature.substring(0, methodSignature.indexOf('('))}`;
    } else {
        // Without the Apex Language Server, we'll take the quick-and-dirty route
        // of just identifying the exact word the user selected, and assuming that's the name of a method.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        vscode.window.showWarningMessage(messages.targeting.warnings.apexLspUnavailable);
        const wordRange: vscode.Range = textDocument.getWordRangeAtPosition(cursorPosition);
        return `${fileName}#${textDocument.getText(wordRange)}`;
    }
}

/**
 * Identifies the method definition symbol that most closely precedes the cursor's current position.
 * @param symbols Symbols returned via the Apex Language Server
 * @param cursorPosition The current location of the cursor
 * @returns
 */
function getNearestMethodSymbol(symbols: GenericSymbol[], cursorPosition: vscode.Position): GenericSymbol {
    let nearestMethodSymbol: GenericSymbol = null;
    let nearestMethodPosition: vscode.Position = null;
    for (const symbol of symbols) {
        // Skip symbols for non-methods.
        if (symbol.kind !== vscode.SymbolKind.Method) {
            continue;
        }
        // Get this method symbol's start line.
        const symbolStartPosition: vscode.Position = isDocumentSymbol(symbol)
            ? symbol.range.start
            : symbol.location.range.start;

        // If this method symbol is defined after the cursor's current line, skip it.
        // KNOWN BUG: If multiple methods are defined on the same line as the cursor,
        //            the latest one is used regardless of the cursor's location.
        //            Deemed acceptable, because you shouldn't define multiple methods per line.
        if (symbolStartPosition.line > cursorPosition.line) {
            continue;
        }

        // Compare this method to the current nearest, and keep the later one.
        if (!nearestMethodPosition || nearestMethodPosition.isBefore(symbolStartPosition)) {
            nearestMethodSymbol = symbol;
            nearestMethodPosition = symbolStartPosition;
        }
    }
    return nearestMethodSymbol;
}

/**
 * Get the project containing the specified file.
 */
export function getProjectDir(targetFile: string): string {
    const uri = vscode.Uri.file(targetFile);
    return vscode.workspace.getWorkspaceFolder(uri).uri.fsPath;
}

/**
 * Type-guard for {@link vscode.DocumentSymbol}.
 */
function isDocumentSymbol(o: GenericSymbol): o is vscode.DocumentSymbol {
    return 'range' in o;
}
