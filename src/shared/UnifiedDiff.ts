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

/**
 * Class representing and implementing functionality for unified diff.
 */
export class UnifiedDiff {
  protected sourceCode: string;
  protected targetCode: string;
  protected unifiedCode: string;
  protected hunks: DiffHunk[];
  protected decorations: {
    range: vscode.Range;
    decoration: vscode.TextEditorDecorationType;
  }[];
  protected diffs: jsdiff.Change[];

  /**
   * Constructor for UnifiedDiff.
   * @param sourceCode Source code to compare.
   * @param targetCode Target code to compare.
   */
  constructor(sourceCode: string, targetCode: string) {
    this.sourceCode = sourceCode.trim();
    this.targetCode = targetCode.trim();
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
    this.sourceCode = code.trim();
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
    this.targetCode = code.trim();
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
  public calcUnifiedCode() {
    this.unifiedCode = '';
    for (let i = 0; i < this.hunks.length; i++) {
      const hunk = this.hunks[i];
      this.unifiedCode += hunk.lines.join('\n') + '\n';
    }
  }

  /**
   * Calculate the diffs between source and target code.
   */
  public calcDiffs() {
    let sourceLine = 0;
    let targetLine = 0;
    let unifiedLine = 0;

    this.diffs = jsdiff.diffLines(this.sourceCode, this.targetCode);
    this.hunks = [];

    for (const diff of this.diffs) {
      const hunk = {} as DiffHunk;
      (hunk.type = diff.added ? DiffType.Insert : diff.removed ? DiffType.Delete : DiffType.Unmodified),
        (hunk.diff = diff);

      if (!diff.value) diff.value = '';

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
    if (!editor || editor.document !== document) return;

    let currentLine = 0;
    const decorations: {
      range: vscode.Range;
      decoration: vscode.TextEditorDecorationType;
    }[] = [];

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
    let currentLine = 0;

    const acceptAllCommand: vscode.Command = {
      title: '$(check) Accept All',
      command: CODEGENIE_UNIFIED_DIFF_ACCEPT_ALL,
      arguments: []
    };

    const rejectAllCommand: vscode.Command = {
      title: '$(x) Reject All',
      command: CODEGENIE_UNIFIED_DIFF_REJECT_ALL,
      arguments: []
    };

    for (let i = 0; i < this.hunks.length; i++) {
      const hunk = this.hunks[i];
      try {
        if (hunk.type === DiffType.Unmodified) continue;

        // skip options for next hunk if it is an insert after a delete
        if (i > 0) {
          const prevHunk = this.hunks[i - 1];
          if (prevHunk.type === DiffType.Delete && hunk.type === DiffType.Insert) continue;
        }

        const range = new vscode.Range(currentLine, 0, currentLine + hunk.lines.length - 1, 0);
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: '$(check) Accept',
            command: CODEGENIE_UNIFIED_DIFF_ACCEPT,
            arguments: [hunk, range]
          })
        );
        codeLenses.push(
          new vscode.CodeLens(range, {
            title: '$(x) Reject',
            command: CODEGENIE_UNIFIED_DIFF_REJECT,
            arguments: [hunk]
          })
        );
        codeLenses.push(new vscode.CodeLens(range, acceptAllCommand));
        codeLenses.push(new vscode.CodeLens(range, rejectAllCommand));
      } finally {
        currentLine += hunk.lines.length;
      }
    }

    return codeLenses;
  }

  /**
   * Accept a hunk.
   * @param hunk Hunks to accept.
   */
  public acceptHunk(hunk: DiffHunk) {
    if (!hunk || hunk.type === DiffType.Unmodified) return;

    this._acceptHunk(hunk);

    // accept next hunk if it is an insert after a delete
    if (hunk.type === DiffType.Delete) {
      const nextHunkIndex = this.hunks.indexOf(hunk) + 1;
      if (nextHunkIndex < this.hunks.length) {
        const nextHunk = this.hunks[nextHunkIndex];
        if (nextHunk.type === DiffType.Insert) this._acceptHunk(nextHunk);
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
    if (!hunk || hunk.type === DiffType.Unmodified) return;
    this._rejectHunk(hunk);

    // reject next hunk if it is an insert after a delete
    if (hunk.type === DiffType.Delete) {
      const nextHunkIndex = this.hunks.indexOf(hunk) + 1;
      if (nextHunkIndex < this.hunks.length) {
        const nextHunk = this.hunks[nextHunkIndex];
        if (nextHunk.type === DiffType.Insert) this._rejectHunk(nextHunk);
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
    this.sourceCode = updated.trim();
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
    this.targetCode = updated.trim();
    for (let i = this.hunks.indexOf(hunk) + 1; i < this.hunks.length; i++) {
      this.hunks[i].targetLine += delta;
    }
  }
}

/**
 * Class to handle unified diff functionality in CodeGenie.
 */
export class VSCodeUnifiedDiff implements vscode.CodeLensProvider, vscode.CodeActionProvider {
  static singleton: VSCodeUnifiedDiff = new VSCodeUnifiedDiff();

  protected unifiedDiffs = new Map<string, UnifiedDiff>();

  /**
   * Activate the extension.
   * @param context Activation context for the extension.
   */
  public activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(this.onDocumentOpened, this));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(this.onDocumentClosed, this));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(this.onDocumentChanged, this));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor, this));
    context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: '*', scheme: 'file' }, this));
    context.subscriptions.push(vscode.languages.registerCodeActionsProvider('*', this));
  }

  /**
   * Provide code actions for unified diff.
   * @returns Code actions for unified diff.
   */
  public provideCodeActions() {
    const actions: any[] = [];

    // let action;
    // action = new vscode.CodeAction(
    //     'Unified Diff',
    //     vscode.CodeActionKind.Refactor
    // );
    // action.command = {
    //     command: CODEGENIE_UNIFIED_DIFF,
    //     title: 'Unified Diff',
    // };
    // actions.push(action);

    return actions;
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
  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const diff = this.unifiedDiffs.get(document.uri.toString());
    if (!diff) return [];
    return diff.renderCodeLenses();
  }

  /**
   * Resolve a code lens.
   * @param codeLens Code lens to resolve.
   * @param _token Cancellation token.
   * @returns Resolved code lens.
   */
  public resolveCodeLens(
    codeLens: vscode.CodeLens,
    _token: vscode.CancellationToken
  ) {
    return codeLens;
  }

  /**
   * Accept a hunk.
   * @param hunk Hunk to accept.
   */
  public async unifiedDiffAccept(hunk: DiffHunk) {
    if (!hunk) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const diff = this.unifiedDiffs.get(editor.document.uri.toString());
    if (!diff) return;
    diff.acceptHunk(hunk);
    await this.renderUnifiedDiff(editor.document);
    this.checkRedundantUnifiedDiff(editor.document);
  }

  /**
   * Reject a hunk.
   * @param hunk Hunk to reject.
   */
  public async unifiedDiffReject(hunk: DiffHunk) {
    if (!hunk) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const diff = this.unifiedDiffs.get(editor.document.uri.toString());
    if (!diff) return;
    diff.rejectHunk(hunk);
    await this.renderUnifiedDiff(editor.document);
    this.checkRedundantUnifiedDiff(editor.document);
  }

  /**
   * Accept all changes in the unified diff.
   */
  public async unifiedDiffAcceptAll(): Promise<number> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return 0;
    const diff = this.unifiedDiffs.get(editor.document.uri.toString());
    if (!diff) return 0;
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
    if (!editor) return;
    const diff = this.unifiedDiffs.get(editor.document.uri.toString());
    if (!diff) return;
    diff.setTargetCode(diff.getSourceCode());
    await this.renderUnifiedDiff(editor.document);
    this.checkRedundantUnifiedDiff(editor.document);
  }

  /**
   * Start a unified diff for the given code and file.
   * @param code Code to diff against.
   * @param file File to diff against.
   */
  public async unifiedDiff(code: string, file?: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    if (!code) return;
    //if (!code) code = loadSampleFile('test2.js');
    let document;

    if (file && file !== editor.document.uri.toString())
      document = await vscode.workspace.openTextDocument(vscode.Uri.parse(file));
    else document = editor.document;

    await this.revertUnifiedDiff(document);

    const diff = new UnifiedDiff(document.getText(), code);
    diff.calcDiffs();
    diff.calcUnifiedCode();

    if (
      diff.getHunks().length === 0 ||
      (diff.getHunks().length === 1 && diff.getHunks()[0].type === DiffType.Unmodified)
    ) {
      vscode.window.showInformationMessage('Ask CodeGenie: No changes to diff.');
      return;
    }

    this.unifiedDiffs.set(document.uri.toString(), diff);

    await this.renderUnifiedDiff(document);
  }

  /**
   * Active text editor changed.
   * @param editor Editor that is currently active.
   */
  protected onDidChangeActiveTextEditor(editor: vscode.TextEditor) {
    if (!editor) return;
    this.renderUnifiedDiff(editor.document);
  }

  /**
   * Document opened.
   * @param _document Document that was opened.
   */
  protected onDocumentOpened(_document: vscode.TextDocument) {
    // noop
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
    if (!event) return;
    if (event.contentChanges.length === 0) return;
    const document = event.document;
    if (!document) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
    const diff = this.unifiedDiffs.get(document.uri.toString());
    if (!diff) return;
    const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === document.uri.toString());
    if (!editor) return;
    if (document.getText() === diff.getUnifiedCode()) return;
    await this.renderUnifiedDiff(document);
    vscode.window.showWarningMessage('Please accept/reject all changes before editing the file.');
  }

  /**
   * Render unified diff for the given document.
   * @param document Document to render unified diff for.
   */
  protected async renderUnifiedDiff(document: vscode.TextDocument) {
    const diff = this.unifiedDiffs.get(document.uri.toString());
    if (!diff) return;

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
    if (!diff) return;
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
    if (!diff) return;
    if (
      diff.getHunks().length === 0 ||
      (diff.getHunks().length == 1 && diff.getHunks()[0].type === DiffType.Unmodified)
    ) {
      this.unifiedDiffs.delete(document.uri.toString());
    }
  }
}
