import * as vscode from 'vscode';

/**
 * Used for working with the context of the currently opened workspace.
 */
export class WorkspaceState {
    private static workspaceState: vscode.Memento;
    
    public static initialize(context: vscode.ExtensionContext): void {
        WorkspaceState.workspaceState = context.workspaceState;
    }

    public static getValue<T>(key: string): T | undefined {
        return WorkspaceState.workspaceState.get<T>(key);
    }

    public static setValue<T>(key: string, value: T): void {
        WorkspaceState.workspaceState.update(key, value);
    }

}