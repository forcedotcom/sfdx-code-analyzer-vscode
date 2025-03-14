import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts

// This file contains stubs/mocks/etc which are not available in the 'jest-mock-vscode' package

export class StubCodeActionContext implements vscode.CodeActionContext {
    readonly diagnostics: readonly vscode.Diagnostic[];
    readonly only: vscode.CodeActionKind | undefined;
    readonly triggerKind: vscode.CodeActionTriggerKind;

    constructor(options: Partial<StubCodeActionContext> = {}) {
        this.diagnostics = options.diagnostics || [];
        this.only = options.only || vscode.CodeActionKind.QuickFix;
        this.triggerKind = options.triggerKind || 2;
    }
}
