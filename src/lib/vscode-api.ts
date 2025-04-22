import * as vscode from 'vscode';
import * as Constants from "./constants";

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

/**
 * Interface that provides a level of indirection around various vscode window control
 */
export interface WindowManager {
    showLogOutputWindow(): void

    showExternalUrl(url: string): void

    // TODO: we might also move to here the ability to show our settings page
}

export class WindowManagerImpl {
    private readonly logOutputChannel: vscode.LogOutputChannel;

    constructor(logOutputChannel: vscode.LogOutputChannel) {
        this.logOutputChannel = logOutputChannel;

    }

    showLogOutputWindow(): void {
        // We do not want to preserve focus, but instead to gain focus in the output window. This is why we pass in false.
        this.logOutputChannel.show(false);
    }

    showExternalUrl(url: string): void {
        void vscode.commands.executeCommand(Constants.VSCODE_COMMAND_OPEN_URL, vscode.Uri.parse(url));
    }
}
