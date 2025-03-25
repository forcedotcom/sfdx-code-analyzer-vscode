import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts
import {CodeAnalyzerDiagnostic, Violation} from "../../../lib/diagnostics";

describe('Tests for the CodeAnalyzerDiagnostic class', () => {
    describe('Tests for the fromViolation static constructor method', () => {
        it('When a violation does not have a valid primary code location, then error', () => {
            const violation: Violation = {
                rule: 'dummyRule',
                engine: 'dummyEngine',
                message: 'dummyMessage',
                severity: 3,
                locations: [], // Case 1 - no locations
                primaryLocationIndex: 0,
                resources: []
            }
            expect(() => CodeAnalyzerDiagnostic.fromViolation(violation)).toThrow();
            violation.locations = [{}] // Case 2 - everything is undefined
            expect(() => CodeAnalyzerDiagnostic.fromViolation(violation)).toThrow();
        });

        it('When a violation with a single code location is given, then all the fields should be filled out correctly', () => {
            const violation: Violation = {
                rule: 'dummyRule',
                engine: 'dummyEngine',
                message: 'dummyMessage',
                severity: 1,
                locations: [{
                    file: '/path/to/some/someFile.cls',
                    startLine: 3,
                    startColumn: 5,
                    endLine: 12,
                    endColumn: 6
                }],
                primaryLocationIndex: 0,
                resources: ['https://hello.com', 'https://world.com']
            };

            const diag: CodeAnalyzerDiagnostic = CodeAnalyzerDiagnostic.fromViolation(violation);
            expect(diag.violation).toEqual(violation);
            expect(diag.uri).toEqual(vscode.Uri.file('/path/to/some/someFile.cls'));
            expect(diag.code).toEqual({
                target: vscode.Uri.parse('https://hello.com'),
                value: 'dummyRule'
            });
            expect(diag.source).toEqual('dummyEngine via Code Analyzer');
            expect(diag.severity).toEqual(vscode.DiagnosticSeverity.Warning);
            expect(diag.range).toEqual(new vscode.Range(2, 4, 11, 5));
            expect(diag.relatedInformation).toEqual(undefined);
        });

        it('When a violation with multiple code locations is given, then all the fields should be filled out correctly', () => {
            const violation: Violation = {
                rule: 'dummyRule',
                engine: 'dummyEngine',
                message: 'dummyMessage',
                severity: 5,
                locations: [
                    {
                        file: '/path/to/some/someFile.cls',
                        startLine: 1,
                        startColumn: 2,
                        endLine: 3,
                        endColumn: 4
                    },
                    {
                        file: '/path/to/some/someFileButNoLineInfo.cls',
                    },
                    {
                        file: '/path/to/some/someFileWithSomeLineInfo.cls',
                        startLine: 73,
                        endColumn: 21
                    },
                    {
                        file: '/path/to/some/someFileWithSomeLineInfo.cls',
                        endLine: 18,
                    }
                ],
                primaryLocationIndex: 2,
                resources: [] // Also test when there are no resources
            };

            const diag: CodeAnalyzerDiagnostic = CodeAnalyzerDiagnostic.fromViolation(violation);
            expect(diag.violation).toEqual(violation);
            expect(diag.uri).toEqual(vscode.Uri.file('/path/to/some/someFileWithSomeLineInfo.cls'));
            expect(diag.code).toEqual('dummyRule');
            expect(diag.source).toEqual('dummyEngine via Code Analyzer');
            expect(diag.severity).toEqual(vscode.DiagnosticSeverity.Warning);
            expect(diag.range).toEqual(new vscode.Range(72, 0, 72, 20));
            expect(diag.relatedInformation).toHaveLength(3); // For the 3 other locations besides the primary location
            expect(diag.relatedInformation[0]).toEqual(new vscode.DiagnosticRelatedInformation(
                new vscode.Location(
                    vscode.Uri.file('/path/to/some/someFile.cls'),
                    new vscode.Range(0, 1, 2, 3)),
                undefined));
            expect(diag.relatedInformation[1]).toEqual(new vscode.DiagnosticRelatedInformation(
                new vscode.Location(
                    vscode.Uri.file('/path/to/some/someFileButNoLineInfo.cls'),
                    new vscode.Range(0, 0, 0, Number.MAX_SAFE_INTEGER)),
                undefined));
            expect(diag.relatedInformation[2]).toEqual(new vscode.DiagnosticRelatedInformation(
                new vscode.Location(
                    vscode.Uri.file('/path/to/some/someFileWithSomeLineInfo.cls'),
                    new vscode.Range(0, 0, 17, Number.MAX_SAFE_INTEGER)),
                undefined));
        });

        it.each([
            'ApexDoc', 'ApexSharingViolations', 'ExcessiveParameterList'
        ])('When processing the range for a violation for %s, then we fix the range as we wait for PMD to fix this issue', (ruleName: string) => {
            const violation: Violation = {
                rule: ruleName,
                engine: 'pmd',
                message: 'dummyMessage',
                severity: 3,
                locations: [{
                    file: '/path/to/some/someFile.cls',
                    startLine: 3,
                    startColumn: 5,
                    endLine: 12,
                    endColumn: 6
                }],
                primaryLocationIndex: 0,
                resources: []
            };

            const diag: CodeAnalyzerDiagnostic = CodeAnalyzerDiagnostic.fromViolation(violation);
            expect(diag.range).toEqual(new vscode.Range(2, 4, 2, Number.MAX_SAFE_INTEGER));
        });

        it.each([-2, 0])('When violation has a non-positive line, then we correct it. (this really should never happen)', (nonPositiveNumber: number) => {
            const violation: Violation = {
                rule: 'dummyRule',
                engine: 'dummyEngine',
                message: 'dummyMessage',
                severity: 5,
                locations: [{
                    file: '/path/to/some/someFile.cls',
                    startLine: nonPositiveNumber, // <-- This should never happen, but we should protect against it
                }],
                primaryLocationIndex: 0,
                resources: []
            };

            const diag: CodeAnalyzerDiagnostic = CodeAnalyzerDiagnostic.fromViolation(violation);
            expect(diag.range.start.line).toEqual(0);
        });
    });
});

// TODO: Add tests in for the DiagnosticManager
