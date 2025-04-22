import * as vscode from 'vscode';

/**
 * Interface that provides a level of indirection around various workspace methods of the vscode api
 */
export interface VscodeWorkspace {
    getWorkspaceFolders(): string[]
}

export class VscodeWorkspaceImpl implements VscodeWorkspace {
    getWorkspaceFolders(): string[] {
        return vscode.workspace.workspaceFolders?.map(wf => wf.uri.fsPath) || [];
    }
}
