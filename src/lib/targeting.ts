/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';
import {glob} from 'glob';
import {FileHandlerImpl} from './fs-utils';
import {messages} from './messages';

/**
 * Identifies all targeted files or directories based on either manual
 * selection by the user or by contextual determination of the currently open file.
 * @param selections The URIs of files that have been manually selected.
 * @returns Paths of targeted files.
 * @throws If no files are selected and no file is open in the editor.
 */
export async function getFilesFromSelection(selections: vscode.Uri[]): Promise<string[]> {
    // Use a Set to preserve uniqueness.
    const targets: Set<string> = new Set();
    const fileHandler: FileHandlerImpl = new FileHandlerImpl();
    for (const selection of selections) {
        if (!(await fileHandler.exists(selection.fsPath))) {
            // This should never happen, but we should handle it gracefully regardless.
            throw new Error(messages.targeting.error.nonexistentSelectedFileGenerator(selection.fsPath));
        } else if (await fileHandler.isDir(selection.fsPath)) {
            // Globby wants forward-slashes, but Windows uses back-slashes, so we need to convert the
            // latter into the former.
            const globbablePath = selection.fsPath.replace(/\\/g, '/');
            const globOut: string[] = await glob(`${globbablePath}/**/*`, {nodir: true});
            // Globby's results are Unix-formatted. Do a Uri.file roundtrip to return the path
            // to its expected form.

            globOut.forEach(o => targets.add(vscode.Uri.file(o).fsPath));
        } else {
            targets.add(selection.fsPath);
        }
    }
    return [...targets];
}

/**
 * Get the project containing the specified file.
 */
export function getProjectDir(targetFile?: string): string {
    if (!targetFile) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders[0].uri.fsPath;
        }
        return undefined;
    }
    const uri = vscode.Uri.file(targetFile);
    return vscode.workspace.getWorkspaceFolder(uri).uri.fsPath;
}
