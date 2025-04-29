import * as vscode from "vscode";
import {CodeAnalyzerDiagnostic, Violation} from "../../lib/diagnostics";

export function createSampleCodeAnalyzerDiagnostic(uri: vscode.Uri, range: vscode.Range, ruleName: string = 'someRule'): CodeAnalyzerDiagnostic {
    const sampleViolation: Violation = {
        rule: ruleName,
        engine: 'pmd',
        message: 'This message is unimportant',
        severity: 3,
        locations: [
            {
                file: uri.fsPath,
                startLine: range.start.line + 1, // Violations are 1 based while ranges are 0 based, so adjusting for this
                startColumn: range.start.character + 1,
                endLine: range.end.line + 1,
                endColumn: range.end.character + 1
            }
        ],
        primaryLocationIndex: 0,
        tags: [],
        resources: []
    }
    const diag: CodeAnalyzerDiagnostic = CodeAnalyzerDiagnostic.fromViolation(sampleViolation);
    diag.code = ruleName;
    diag.source = 'pmd via Code Analyzer';
    return diag;
}
