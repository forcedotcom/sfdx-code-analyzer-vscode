/* eslint-disable */
/**
* Copyright (c) 2023, salesforce.com, inc.
* All rights reserved.
* Licensed under the BSD 3-Clause license.
* For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
**/
import * as jsdiff from 'diff';
import * as vscode from 'vscode';

export const CODEGENIE_UNIFIED_DIFF_ACCEPT = 'unifiedDiff.accept';
export const CODEGENIE_UNIFIED_DIFF_REJECT = 'unifiedDiff.reject';
export const CODEGENIE_UNIFIED_DIFF_ACCEPT_ALL = 'unifiedDiff.acceptAll';
export const CODEGENIE_UNIFIED_DIFF_REJECT_ALL = 'unifiedDiff.rejectAll';

const CODEGENIE_EXECUTE_CALLBACK = 'unifiedDiff.executeCallback';

type AsyncCallback = () => Promise<void>;

/**
* Enum representing the type of diff.
*/
export enum DiffType {
    Insert = 'insert',
    Delete = 'delete',
    Unmodified = 'unmodified'
}

/**
* Class representing a diff hunk.
*/
export class DiffHunk {
    type: DiffType;
    diff: jsdiff.Change;
    sourceLine: number;
    targetLine: number;
    unifiedLine: number;
    lines: string[];
}

type DecorationData = {
    range: vscode.Range;
    decoration: vscode.TextEditorDecorationType;
}

/**
* Class representing and implementing functionality for unified diff.
*/
export class UnifiedDiff {
    readonly document: vscode.TextDocument;

    /**
     * TODO - Add description here
     */
    allowAbilityToAcceptOrRejectIndividualHunks: boolean = true;

    /**
     * TODO - Add description here
     */
    acceptCallback?: AsyncCallback;

    /**
     * TODO - Add description here
     */
    acceptAllCallback?: AsyncCallback;

    /**
     * TODO - Add description here
     */
    rejectCallback?: AsyncCallback;

    /**
     * TODO - Add description here
     */
    rejectAllCallback?: AsyncCallback;


    protected sourceCode: string;
    protected targetCode: string;
    protected unifiedCode: string;
    protected hunks: DiffHunk[];
    protected decorations: DecorationData[];
    protected diffs: jsdiff.Change[];

    /**
    * Constructor for UnifiedDiff.
    * @param document document containing the source code
    * @param targetCode Target code to compare.
    */
    constructor(document: vscode.TextDocument, targetCode: string) {
        this.document = document;
        this.sourceCode = document.getText();
        this.targetCode = targetCode;
        this.calcDiffs();
        this.calcUnifiedCode();
    }

    /**
    * Get the source code.
    * @returns Source code.
    */
    public getSourceCode(): string {
        return this.sourceCode;
    }

    /**
    * Get the source code.
    * @param code Source code to set.
    */
    public setSourceCode(code: string) {
        this.sourceCode = code;
        this.calcDiffs();
        this.calcUnifiedCode();
    }

    /**
    * Get the target code.
    * @returns Target code.
    */
    public getTargetCode(): string {
        return this.targetCode;
    }

    /**
    * Set the target code.
    * @param code Target code to set.
    */
    public setTargetCode(code: string) {
        this.targetCode = code;
        this.calcDiffs();
        this.calcUnifiedCode();
    }

    /**
    * Get the hunks.
    * @returns Array of hunks.
    */
    public getHunks(): DiffHunk[] {
        return this.hunks;
    }

    /**
    * Get the unified code.
    * @returns Unified code.
    */
    public getUnifiedCode(): string {
        return this.unifiedCode;
    }

    /**
    * Calculate the unified code based on the diffs.
    */
    private calcUnifiedCode() {
        this.unifiedCode = '';
        for (let i = 0; i < this.hunks.length; i++) {
            const hunk = this.hunks[i];
            this.unifiedCode += hunk.lines.join('\n') + '\n';
        }
    }

    /**
    * Calculate the diffs between source and target code.
    */
    private calcDiffs() {
        let sourceLine = 0;
        let targetLine = 0;
        let unifiedLine = 0;

        this.diffs = jsdiff.diffLines(this.sourceCode, this.targetCode);
        this.hunks = [];

        for (const diff of this.diffs) {
            const hunk = {} as DiffHunk;
            (hunk.type = diff.added ? DiffType.Insert : diff.removed ? DiffType.Delete : DiffType.Unmodified),
            (hunk.diff = diff);

            if (!diff.value) {
                diff.value = '';
            }

            hunk.lines = diff.value.replace(/\s$/, '').split('\n');
            if (hunk.type === DiffType.Insert) {
                hunk.sourceLine = sourceLine;
                hunk.targetLine = targetLine;
                targetLine += hunk.lines.length;
            } else if (hunk.type === DiffType.Delete) {
                hunk.sourceLine = sourceLine;
                hunk.targetLine = targetLine;
                sourceLine += hunk.lines.length;
            } else {
                hunk.sourceLine = sourceLine;
                hunk.targetLine = targetLine;
                sourceLine += hunk.lines.length;
                targetLine += hunk.lines.length;
            }
            hunk.unifiedLine = unifiedLine;
            unifiedLine += hunk.lines.length;
            this.hunks.push(hunk);
        }
    }

    /**
    * Render decorations on the given document.
    * @param document Document to render decorations on.
    */
    public renderDecorations(document: vscode.TextDocument) {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document) {
            return;
        }

        let currentLine = 0;
        const decorations: DecorationData[] = [];

        if (this.decorations) {
            for (const { decoration } of this.decorations) {
                decoration.dispose();
            }
            delete this.decorations;
        }

        this.hunks.forEach((hunk) => {
            if (hunk.type !== DiffType.Unmodified) {
                const range = new vscode.Range(currentLine, 0, currentLine + hunk.lines.length - 1, 0);
                const decoration = vscode.window.createTextEditorDecorationType({
                    backgroundColor: hunk.type === DiffType.Insert ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 0, 0, 0.1)',
                    textDecoration: hunk.type === DiffType.Delete ? 'line-through' : undefined,
                    isWholeLine: true
                });
                decorations.push({ range, decoration });
            }

            currentLine += hunk.lines.length;
        });

        for (const { range, decoration } of decorations) {
            editor.setDecorations(decoration, [range]);
        }

        this.decorations = decorations;
    }

    /**
    * Render code lenses for the hunks.
    * @returns Rendered code lenses for the hunks.
    */
    public renderCodeLenses(): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];

        type DiffHunkWithRange = DiffHunk & {
            range: vscode.Range
        };

        let currentLine = 0;
        const hunksWithRanges: DiffHunkWithRange[] = this.hunks.map((hunk: DiffHunk, i: number, allHunks: DiffHunk[]) => {
            const hunkWithRange: DiffHunkWithRange = {
                ...hunk,
                range: new vscode.Range(currentLine, 0, currentLine + hunk.lines.length - 1, 0)
            };
            currentLine += hunk.lines.length;
            return hunkWithRange;
        });

        const hunksToDisplay: DiffHunkWithRange[] = hunksWithRanges.filter((hunk: DiffHunkWithRange, i: number, allHunks: DiffHunkWithRange[]) => {
            // skip hunk if it is unmodified or if it is an 'insert' after a 'delete'
            const toSkip: boolean = hunk.type === DiffType.Unmodified ||
                (i > 0 && allHunks[i - 1].type === DiffType.Delete && hunk.type === DiffType.Insert);
            return !toSkip;
        });

        let allSuffix: string = ' All';

        for (const hunk of hunksToDisplay) {
            if (this.allowAbilityToAcceptOrRejectIndividualHunks) {
                const defaultAcceptCallback: AsyncCallback = async (): Promise<void> => {
                    await vscode.commands.executeCommand(CODEGENIE_UNIFIED_DIFF_ACCEPT, hunk, hunk.range);
                };
                codeLenses.push(new vscode.CodeLens(hunk.range, {
                    title: '$(check) Accept',
                    command: CODEGENIE_EXECUTE_CALLBACK,
                    arguments: [this.acceptCallback || defaultAcceptCallback]
                }));

                const defaultRejectCallback: AsyncCallback = async (): Promise<void> => {
                    await vscode.commands.executeCommand(CODEGENIE_UNIFIED_DIFF_REJECT, hunk);
                }
                codeLenses.push(new vscode.CodeLens(hunk.range, {
                    title: '$(x) Reject',
                    command: CODEGENIE_EXECUTE_CALLBACK,
                    arguments: [this.rejectCallback || defaultRejectCallback]
                }));
            } else if (hunksToDisplay.length === 1) {
                // If not displaying the "Accept All" and "Reject All" buttons and there is only 1 hunk, then
                // we can remove the safely remove the word " All" from the acceptAll and rejectAll buttons.
                allSuffix = '';
            }

            const defaultAcceptAllCallback: AsyncCallback = async (): Promise<void> => {
                await vscode.commands.executeCommand(CODEGENIE_UNIFIED_DIFF_ACCEPT_ALL);
            };
                codeLenses.push(new vscode.CodeLens(hunk.range, {
                title: '$(check) Accept' + allSuffix,
                command: CODEGENIE_EXECUTE_CALLBACK,
                arguments: [this.acceptAllCallback || defaultAcceptAllCallback]
            }));

            const defaultRejectAllCallback: AsyncCallback = async (): Promise<void> => {
                await vscode.commands.executeCommand(CODEGENIE_UNIFIED_DIFF_REJECT_ALL);
            };
            codeLenses.push(new vscode.CodeLens(hunk.range, {
                title: '$(x) Reject' + allSuffix,
                command: CODEGENIE_EXECUTE_CALLBACK,
                arguments: [this.rejectAllCallback || defaultRejectAllCallback]
            }));

            currentLine += hunk.lines.length;
        }

        return codeLenses;
    }

    /**
    * Accept a hunk.
    * @param hunk Hunks to accept.
    */
    public acceptHunk(hunk: DiffHunk) {
        if (!hunk || hunk.type === DiffType.Unmodified) {
            return;
        }

        this._acceptHunk(hunk);

        // accept next hunk if it is an insert after a delete
        if (hunk.type === DiffType.Delete) {
            const nextHunkIndex = this.hunks.indexOf(hunk) + 1;
            if (nextHunkIndex < this.hunks.length) {
                const nextHunk = this.hunks[nextHunkIndex];
                if (nextHunk.type === DiffType.Insert) {
                    this._acceptHunk(nextHunk);
                }
            }
        }

        this.calcDiffs();
        this.calcUnifiedCode();
    }

    /**
    * Reject a hunk.
    * @param hunk Hunks to reject.
    */
    public rejectHunk(hunk: DiffHunk) {
        if (!hunk || hunk.type === DiffType.Unmodified) {
            return;
        }
        this._rejectHunk(hunk);

        // reject next hunk if it is an insert after a delete
        if (hunk.type === DiffType.Delete) {
            const nextHunkIndex = this.hunks.indexOf(hunk) + 1;
            if (nextHunkIndex < this.hunks.length) {
                const nextHunk = this.hunks[nextHunkIndex];
                if (nextHunk.type === DiffType.Insert) {
                    this._rejectHunk(nextHunk);
                }
            }
        }

        this.calcDiffs();
        this.calcUnifiedCode();
    }

    /**
    * Accept a hunk.
    * @param hunk Hunk to accept.
    */
    protected _acceptHunk(hunk: DiffHunk) {
        let updated, delta;
        if (hunk.type === DiffType.Insert) {
            const lines = this.sourceCode.split('\n');
            lines.splice(hunk.sourceLine, 0, ...hunk.lines);
            updated = lines.join('\n');
            delta = hunk.lines.length;
        } else if (hunk.type === DiffType.Delete) {
            const lines = this.sourceCode.split('\n');
            lines.splice(hunk.sourceLine, hunk.lines.length);
            updated = lines.join('\n');
            delta = -hunk.lines.length;
        }
        this.sourceCode = updated;
        for (let i = this.hunks.indexOf(hunk) + 1; i < this.hunks.length; i++) {
            this.hunks[i].sourceLine += delta;
        }
    }

    /**
    * Reject a hunk.
    * @param hunk Hunk to reject.
    */
    protected _rejectHunk(hunk: DiffHunk) {
        let updated, delta;
        if (hunk.type === DiffType.Insert) {
            const lines = this.targetCode.split('\n');
            lines.splice(hunk.targetLine, hunk.lines.length);
            updated = lines.join('\n');
            delta = -hunk.lines.length;
        } else if (hunk.type === DiffType.Delete) {
            const lines = this.targetCode.split('\n');
            lines.splice(hunk.targetLine, 0, ...hunk.lines);
            updated = lines.join('\n');
            delta = hunk.lines.length;
        }
        this.targetCode = updated;
        for (let i = this.hunks.indexOf(hunk) + 1; i < this.hunks.length; i++) {
            this.hunks[i].targetLine += delta;
        }
    }
}

/**
* Class to handle unified diff functionality in CodeGenie.
*/
export class VSCodeUnifiedDiff implements vscode.CodeLensProvider {
    static singleton: VSCodeUnifiedDiff = new VSCodeUnifiedDiff();

    protected unifiedDiffs = new Map<string, UnifiedDiff>();

    /**
    * Activate the extension.
    * @param context Activation context for the extension.
    */
    public activate(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: '*', scheme: 'file' }, this));

        context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(this.onDocumentClosed, this));
        context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(this.onDocumentChanged, this));
        context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor, this));

        context.subscriptions.push(vscode.commands.registerCommand(CODEGENIE_EXECUTE_CALLBACK, async (callBack: AsyncCallback): Promise<void> => {
            await callBack();
        }));
    }

    /**
    * Emitter for when code lenses change.
    */
    protected onDidChangeCodeLensesEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();

    /**
    * Event for when code lenses change.
    */
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this.onDidChangeCodeLensesEmitter.event;

    /**
    * Provide code lenses for the given document.
    * @param document Document to provide code lenses for.
    * @param _token Cancellation token.
    * @returns Code lenses for the document.
    */
    public provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.CodeLens[] {
        const diff = this.unifiedDiffs.get(document.uri.toString());
        if (!diff) {
            return [];
        }
        return diff.renderCodeLenses();
    }




    /**
    * Accept a hunk.
    * @param hunk Hunk to accept.
    */
    public async unifiedDiffAccept(hunk: DiffHunk) {
        if (!hunk) {
            return;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const diff = this.unifiedDiffs.get(editor.document.uri.toString());
        if (!diff) {
            return;
        }
        diff.acceptHunk(hunk);
        await this.renderUnifiedDiff(editor.document);
        this.checkRedundantUnifiedDiff(editor.document);
    }

    /**
    * Reject a hunk.
    * @param hunk Hunk to reject.
    */
    public async unifiedDiffReject(hunk: DiffHunk) {
        if (!hunk) {
            return;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const diff = this.unifiedDiffs.get(editor.document.uri.toString());
        if (!diff) {
            return;
        }
        diff.rejectHunk(hunk);
        await this.renderUnifiedDiff(editor.document);
        this.checkRedundantUnifiedDiff(editor.document);
    }

    /**
    * Accept all changes in the unified diff.
    */
    public async unifiedDiffAcceptAll(): Promise<number> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return 0;
        }
        const diff = this.unifiedDiffs.get(editor.document.uri.toString());
        if (!diff) {
            return 0;
        }
        const diffLines: number = diff.getHunks().reduce((prev, curr) => prev + curr.lines.length, 0);
        diff.setSourceCode(diff.getTargetCode());
        await this.renderUnifiedDiff(editor.document);
        this.checkRedundantUnifiedDiff(editor.document);
        return diffLines;
    }

    /**
    * Reject all changes in the unified diff.
    */
    public async unifiedDiffRejectAll() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const diff = this.unifiedDiffs.get(editor.document.uri.toString());
        if (!diff) {
            return;
        }
        diff.setTargetCode(diff.getSourceCode());
        await this.renderUnifiedDiff(editor.document);
        this.checkRedundantUnifiedDiff(editor.document);
    }

    /**
     * Show the UnifiedDiff
     * @param diff UnifiedDiff
     */
    public async showUnifiedDiff(diff: UnifiedDiff) {
        await this.revertUnifiedDiff(diff.document);

        if (diff.getHunks().length === 0 || (diff.getHunks().length === 1 && diff.getHunks()[0].type === DiffType.Unmodified)) {
            vscode.window.showInformationMessage('Agentforce Fix: No changes to diff.');
            return;
        }

        this.unifiedDiffs.set(diff.document.uri.toString(), diff);

        await this.renderUnifiedDiff(diff.document);
    }



    /**
    * Active text editor changed.
    * @param editor Editor that is currently active.
    */
    protected onDidChangeActiveTextEditor(editor: vscode.TextEditor) {
        if (!editor) {
            return;
        }
        this.renderUnifiedDiff(editor.document);
    }

    /**
    * Document closed.
    * @param document Document that was closed.
    */
    protected onDocumentClosed(document: vscode.TextDocument) {
        this.unifiedDiffs.delete(document.uri.toString());
    }

    /**
    * Document changed.
    * @param event Event that occurred when the document changed.
    */
    protected async onDocumentChanged(event: vscode.TextDocumentChangeEvent) {
        if (!event) {
            return;
        }
        if (event.contentChanges.length === 0) {
            return;
        }
        const document = event.document;
        if (!document) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
        const diff = this.unifiedDiffs.get(document.uri.toString());
        if (!diff) {
            return;
        }
        const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === document.uri.toString());
        if (!editor) {
            return;
        }
        if (document.getText() === diff.getUnifiedCode()) {
            return;
        }
        await this.renderUnifiedDiff(document);
        vscode.window.showWarningMessage('Please accept/reject all changes before editing the file.');
    }

    /**
    * Render unified diff for the given document.
    * @param document Document to render unified diff for.
    */
    protected async renderUnifiedDiff(document: vscode.TextDocument) {
        const diff = this.unifiedDiffs.get(document.uri.toString());
        if (!diff) {
            return;
        }

        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
        edit.replace(document.uri, fullRange, diff.getUnifiedCode());
        await vscode.workspace.applyEdit(edit);

        diff.renderDecorations(document);
        this.onDidChangeCodeLensesEmitter.fire();

        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.uri.toString() === document.uri.toString()) {
            if (diff.getHunks().length > 0) {
                const hunk = diff.getHunks().find((hunk) => hunk.type !== DiffType.Unmodified);
                if (hunk) {
                    const range = new vscode.Range(hunk.unifiedLine, 0, hunk.unifiedLine, 0);
                    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                }
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    /**
    * Reverse the unified diff for the given document.
    * @param document Document to revert unified diff for.
    */
    protected async revertUnifiedDiff(document: vscode.TextDocument) {
        const diff = this.unifiedDiffs.get(document.uri.toString());
        if (!diff) {
            return;
        }
        diff.setTargetCode(diff.getSourceCode());
        await this.renderUnifiedDiff(document);
        this.unifiedDiffs.delete(document.uri.toString());
    }

    /**
    * Check for redundant unified diff in the document.
    * @param document Document to check for redundant unified diff.
    */
    protected checkRedundantUnifiedDiff(document: vscode.TextDocument) {
        const diff = this.unifiedDiffs.get(document.uri.toString());
        if (!diff) {
            return;
        }
        if (diff.getHunks().length === 0 || (diff.getHunks().length == 1 && diff.getHunks()[0].type === DiffType.Unmodified)) {
            this.unifiedDiffs.delete(document.uri.toString());
        }
    }
}
