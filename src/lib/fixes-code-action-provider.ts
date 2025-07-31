/*
 * Copyright (c) 2025, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';
import {messages} from './messages';
import * as Constants from './constants';
import {CodeAnalyzerDiagnostic} from "./diagnostics";

/**
 * Class for providing quick fix functionality to diagnostics associated with Code Analyzer violations that contain fixes
 * 
 * NOTE: Currently this is hard coded to only work on ApexGuru based violations - but soon will be generalized to work on all violations
 */
export class FixesCodeActionProvider implements vscode.CodeActionProvider {
    public provideCodeActions(document: vscode.TextDocument, selectedRange: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
        const filteredDiagnostics: CodeAnalyzerDiagnostic[] = context.diagnostics
            .filter(d => d instanceof CodeAnalyzerDiagnostic)
            .filter(d => !d.isStale())

            // THIS IS TEMPORARY - WE'LL SWITCH THIS FILTER TO INSPECT THE VIOLATION SOON INSTEAD OF LOOKING FOR apexguru diagnostics that have relatedInformation
            .filter(d => d.violation.engine === 'apexguru')
            .filter(d => d.relatedInformation && d.relatedInformation.length > 0)

            // Technically, I don't think VS Code sends in diagnostics that aren't overlapping with the users selection,
            // but just in case they do, then this last filter is an additional sanity check just to be safe
            .filter(d => selectedRange.intersection(d.range) != undefined)
        if (filteredDiagnostics.length == 0) {
            return [];
        }

        return filteredDiagnostics.map(diag => createCodeAction(document, diag)).flat();
    }
}

function createCodeAction(document: vscode.TextDocument, diag: CodeAnalyzerDiagnostic): vscode.CodeAction {
    const suggestedCode = diag.relatedInformation[1].message; // <-- !! THIS IS A BAD ASSUMPTION - WILL FIX THIS SOON !!

    const action = new vscode.CodeAction(
        messages.fixer.fixWithApexGuruSuggestions, // TODO: This will go away soon in favor of a generalized message
        vscode.CodeActionKind.QuickFix);
    action.diagnostics = [diag];
    const range = diag.range;  // Assuming the range is the location of the existing code in the document // <---  !! THIS IS A BAD ASSUMPTION - WILL FIX SOON !!
    const diagnosticStartLine = new vscode.Position(range.start.line, range.start.character);

    // TODO: WILL REWORK THIS SOON IN FAVOR OF A MORE GENERALIZED APPROACH
    action.command = {
        title: 'Apply ApexGuru Fix',
        command: Constants.QF_COMMAND_INCLUDE_APEX_GURU_SUGGESTIONS,
        arguments: [document, diagnosticStartLine, suggestedCode + '\n']
    }

    return action;
}