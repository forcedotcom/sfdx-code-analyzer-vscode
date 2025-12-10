import * as vscode from "vscode";// The vscode module is mocked out. See: scripts/setup.jest.ts

import {Diagnostic} from "vscode";

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

export class FakeDiagnosticCollection implements vscode.DiagnosticCollection {
    readonly diagMap: Map<string, vscode.Diagnostic[]> = new Map<string, vscode.Diagnostic[]>();
    name: string = 'dummyCollectionName';

    set(uri: unknown, diagnostics?: Diagnostic[]): void {
        if (diagnostics) {
            this.diagMap.set((uri as vscode.Uri).fsPath, diagnostics);
        }
    }

    delete(uri: vscode.Uri): void {
        this.diagMap.delete(uri.fsPath);
    }

    clear(): void {
        this.diagMap.clear()
    }

    get(uri: vscode.Uri): readonly vscode.Diagnostic[] | undefined {
        return this.diagMap.get(uri.fsPath);
    }

    has(uri: vscode.Uri): boolean {
        return this.diagMap.has(uri.fsPath);
    }

    forEach(callback: (uri: vscode.Uri, diagnostics: readonly vscode.Diagnostic[], collection: vscode.DiagnosticCollection) => unknown, _thisArg?: unknown): void {
        for (const [fsPath, diagnostics] of this.diagMap.entries()) {
            const uri = vscode.Uri.file(fsPath);
            callback(uri, diagnostics, this);
        }
    }

    [Symbol.iterator](): Iterator<[uri: vscode.Uri, diagnostics: readonly vscode.Diagnostic[]], unknown, unknown> {
        throw new Error("Method not implemented.");
    }

    dispose(): void {
        this.clear();
    }
}
