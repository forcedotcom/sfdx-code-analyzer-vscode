import * as vscode from "vscode";
import {CodeAnalyzerDiagnostic, CodeLocation, Fix, Suggestion} from "../../lib/diagnostics";

export function createSampleCodeAnalyzerDiagnostic(uri: vscode.Uri, range: vscode.Range, ruleName: string = 'someRule', engineName: string = 'pmd'): CodeAnalyzerDiagnostic {
    return CodeAnalyzerDiagnostic.fromViolation(createSampleViolation({
        file: uri.fsPath,
        startLine: range.start.line + 1, // Violations are 1 based while ranges are 0 based, so adjusting for this
        startColumn: range.start.character + 1,
        endLine: range.end.line + 1,
        endColumn: range.end.character + 1
    },
    ruleName,
    engineName));
}

export function createSampleViolation(location: CodeLocation, ruleName: string = 'someRule', engineName: string = 'pmd', fixes?: Fix[], suggestions?: Suggestion[]) {
    return {
        rule: ruleName,
        engine: engineName,
        message: 'Some dummy violation message',
        severity: 3,
        locations: [
            location
        ],
        primaryLocationIndex: 0,
        tags: [],
        resources: [],
        fixes: fixes,
        suggestions: suggestions
    };
}