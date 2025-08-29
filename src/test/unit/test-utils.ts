import * as vscode from "vscode";
import {CodeAnalyzerDiagnostic, CodeLocation, Fix, Suggestion} from "../../lib/diagnostics";
import { getErrorMessageWithStack } from "../../lib/utils";

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

// To help test asyncronous code (when we purposely do not await a promise), we can use this function to help with
// wait for the async operation to take place. If it doesn't pass within the specified timeout then an exception is thrown.
export async function expectEventuallyIsTrue(conditionFn: () => boolean, timeout: number = 5000, interval: number = 50): Promise<void> {
    const start = Date.now();

    return new Promise<void>((resolve, reject) => {
        let lastErrMsg = '';

        const check = () => {
            try {
                if (conditionFn()) {
                    resolve();
                } else if (Date.now() - start >= timeout) {
                    reject(new Error(`The condition was not satisfied within the allocated ${timeout} milliseconds. ${lastErrMsg}`));
                } else {
                    setTimeout(check, interval);
                }
            } catch (err) {
                lastErrMsg = getErrorMessageWithStack(err);
                setTimeout(check, interval);
            }
        };

        check();
    });
}