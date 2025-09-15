import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts

import {CodeAnalyzerDiagnostic, DiagnosticManager, DiagnosticManagerImpl, Violation} from "../../../lib/diagnostics";
import {FakeDiagnosticCollection} from "../vscode-stubs";
import {createSampleCodeAnalyzerDiagnostic} from "../test-utils";
import {messages} from "../../../lib/messages";

const sampleUri1: vscode.Uri = vscode.Uri.file('/path/to/file1');
const sampleUri2: vscode.Uri = vscode.Uri.file('/path/to/file2');
const sampleUri3: vscode.Uri = vscode.Uri.file('/path/to/file3');

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
                tags: [],
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
                tags: [],
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
                        comment: 'someDummyComment'
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
                tags: [],
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
                messages.diagnostics.defaultAlternativeLocationMessage));
            expect(diag.relatedInformation[1]).toEqual(new vscode.DiagnosticRelatedInformation(
                new vscode.Location(
                    vscode.Uri.file('/path/to/some/someFileButNoLineInfo.cls'),
                    new vscode.Range(0, 0, 0, Number.MAX_SAFE_INTEGER)),
                'someDummyComment'));
            expect(diag.relatedInformation[2]).toEqual(new vscode.DiagnosticRelatedInformation(
                new vscode.Location(
                    vscode.Uri.file('/path/to/some/someFileWithSomeLineInfo.cls'),
                    new vscode.Range(0, 0, 17, Number.MAX_SAFE_INTEGER)),
                messages.diagnostics.defaultAlternativeLocationMessage));
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
                tags: [],
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
                tags: [],
                resources: []
            };

            const diag: CodeAnalyzerDiagnostic = CodeAnalyzerDiagnostic.fromViolation(violation);
            expect(diag.range.start.line).toEqual(0);
        });
    });

    describe('Tests for markStale', () => {
        it('should update message and severity', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(
                sampleUri1, new vscode.Range(0, 0, 0, 1));
            diag.message = 'hello world';
            diag.severity = vscode.DiagnosticSeverity.Warning;

            diag.markStale();

            expect(diag.message).toEqual(messages.staleDiagnosticPrefix + '\nhello world');
            expect(diag.severity).toEqual(vscode.DiagnosticSeverity.Information);
        });
    });

    describe('Tests for isStale', () => {
        it('should return false when diagnostic has not been marked stale', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(
                sampleUri1, new vscode.Range(0, 0, 0, 1));

            // Initially, the message should not start with the stale prefix
            expect(diag.isStale()).toEqual(false);
        });

        it('should return true when diagnostic has been marked stale', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(
                sampleUri1, new vscode.Range(0, 0, 0, 1));
            diag.markStale();

            // Initially, the message should not start with the stale prefix
            expect(diag.isStale()).toEqual(true);
        });
    });
});

describe('Tests for the DiagnosticManager class', () => {
    //  NOTE: The tests for handleTextDocumentChangeEvent method is in its own separate file:
    //        ./diagnostics-handleTextDocumentChangeEvent.test.ts

    let diagnosticCollection: FakeDiagnosticCollection;
    let diagnosticManager: DiagnosticManager;

    beforeEach(() => {
        diagnosticCollection = new FakeDiagnosticCollection();
        diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection);
    });

    describe('Tests for addDiagnostics', () => {
        it('should add diagnostics for each URI', () => {
            const diag1: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(
                sampleUri1, new vscode.Range(0, 0, 0, 1));
            const diag2: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(
                sampleUri2, new vscode.Range(0, 0, 0, 1));
            const diag3: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(
                sampleUri2, new vscode.Range(0, 0, 0, 1));

            diagnosticManager.addDiagnostics([diag1, diag2, diag3]);

            expect(diagnosticCollection.get(sampleUri1)).toHaveLength(1);
            expect(diagnosticCollection.get(sampleUri2)).toHaveLength(2);
        });
    });

    describe('Tests for clearAllDiagnostics', () => {
        it('should clear all diagnostics', () => {
            const diag1: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(
                sampleUri1, new vscode.Range(0, 0, 0, 1));
            const diag2: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(
                sampleUri2, new vscode.Range(0, 0, 0, 1));
            const diag3: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(
                sampleUri2, new vscode.Range(0, 0, 0, 1));

            diagnosticManager.addDiagnostics([diag1, diag2, diag3]);
            diagnosticManager.clearAllDiagnostics();

            expect(diagnosticCollection.get(sampleUri1)).toEqual(undefined);
            expect(diagnosticCollection.get(sampleUri2)).toEqual(undefined);
        });
    });

    describe('Tests for clearDiagnostic', () => {
        it('should remove a specific diagnostic', () => {
            const uri = sampleUri1;
            const diag1: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(uri, new vscode.Range(0, 0, 0, 1));
            const diag2: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(uri, new vscode.Range(1, 0, 1, 1));

            diagnosticManager.addDiagnostics([diag1, diag2]);
            diagnosticManager.clearDiagnostic(diag1);

            expect(diagnosticCollection.get(uri)).toEqual([diag2]);
        });
    });

    describe('Tests for dispose', () => {
        it('should clear all diagnostics when disposed', () => {
            const diag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri1, new vscode.Range(0, 0, 0, 1));

            diagnosticManager.addDiagnostics([diag]);
            diagnosticManager.dispose();

            expect(diagnosticCollection.get(sampleUri1)).toEqual(undefined);
        });
    });

    describe('Tests for clearDiagnosticsForFiles', () => {
        it('should clear diagnostics for multiple files', () => {
            const diag1: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri1, new vscode.Range(0, 0, 0, 1));
            const diag2: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri2, new vscode.Range(0, 0, 0, 1));
            const diag3: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(sampleUri3, new vscode.Range(0, 0, 0, 1));

            diagnosticManager.addDiagnostics([diag1, diag2, diag3]);
            diagnosticManager.clearDiagnosticsForFiles([sampleUri1, sampleUri2]);

            expect(diagnosticCollection.get(sampleUri1)).toEqual(undefined);
            expect(diagnosticCollection.get(sampleUri2)).toEqual(undefined);
            expect(diagnosticCollection.get(sampleUri3)).toHaveLength(1);
        });
    });

    describe('Tests for clearDiagnosticsInRange', () => {
        it('should remove diagnostics within a specified range', () => {
            const uri = sampleUri1;
            const diag1: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(uri, new vscode.Range(0, 0, 0, 1));
            const diag2: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(uri, new vscode.Range(1, 0, 1, 1));

            diagnosticManager.addDiagnostics([diag1, diag2]);
            const rangeToClear = new vscode.Range(0, 0, 0, 1);
            diagnosticManager.clearDiagnosticsInRange(uri, rangeToClear);

            const diagnostics = diagnosticCollection.get(uri);
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics).toContainEqual(diag2);
        });

        it('should not remove diagnostics outside the specified range', () => {
            const uri = sampleUri1;
            const diag1: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(uri, new vscode.Range(0, 0, 0, 1));
            const diag2: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(uri, new vscode.Range(2, 0, 2, 1));

            diagnosticManager.addDiagnostics([diag1, diag2]);
            const rangeToClear = new vscode.Range(1, 0, 1, 1);
            diagnosticManager.clearDiagnosticsInRange(uri, rangeToClear);

            const diagnostics = diagnosticCollection.get(uri);
            expect(diagnostics).toHaveLength(2); // Both diagnostics should remain
        });
    });
});
