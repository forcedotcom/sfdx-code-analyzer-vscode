/*
 * Copyright (c) 2025, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';
import {messages} from './messages';
import {CodeAnalyzerDiagnostic} from "./diagnostics";
import { ApplyViolationFixesAction } from './apply-violation-fixes-action';

/**
 * Class for providing quick fix functionality to diagnostics associated with Code Analyzer violations that contain fixes
 */
export class ApplyViolationFixesActionProvider implements vscode.CodeActionProvider {
    public provideCodeActions(document: vscode.TextDocument, selectedRange: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
        const filteredDiagnostics: CodeAnalyzerDiagnostic[] = context.diagnostics
            .filter(d => d instanceof CodeAnalyzerDiagnostic)
            .filter(d => ApplyViolationFixesAction.isRelevantDiagnostic(d, document))

            // Technically, I don't think VS Code sends in diagnostics that aren't overlapping with the users selection,
            // but just in case they do, then this last filter is an additional sanity check just to be safe
            .filter(d => selectedRange.intersection(d.range) != undefined)

        if (filteredDiagnostics.length == 0) {
            return [];
        }

        return filteredDiagnostics.map(diag => createCodeAction(diag, document));
    }
}

function createCodeAction(diag: CodeAnalyzerDiagnostic, document: vscode.TextDocument): vscode.CodeAction {
    const fixMsg: string = messages.fixer.applyFix(diag.violation.engine, diag.violation.rule);
    const action = new vscode.CodeAction(fixMsg, vscode.CodeActionKind.QuickFix);
    action.diagnostics = [diag]; // Important: this ties the code fix action to the specific diagnostic.
    action.command = {
        title: fixMsg, // Doesn't seem to actually show up anywhere, so just reusing the fix msg
        command: ApplyViolationFixesAction.COMMAND,
        arguments: [diag, document]
    }
    return action;
}