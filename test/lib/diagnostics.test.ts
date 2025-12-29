import * as vscode from "vscode"; // The vscode module is mocked out. See: scripts/setup.jest.ts

import {CodeAnalyzerDiagnostic, DiagnosticFactory, DiagnosticManager, DiagnosticManagerImpl, Violation} from "../../src/lib/diagnostics";
import {FakeDiagnosticCollection} from "../vscode-stubs";
import {createSampleCodeAnalyzerDiagnostic} from "../test-utils";
import {messages} from "../../src/lib/messages";
import * as stubs from "../stubs";

const sampleUri1: vscode.Uri = vscode.Uri.file('/path/to/file1');
const sampleUri2: vscode.Uri = vscode.Uri.file('/path/to/file2');
const sampleUri3: vscode.Uri = vscode.Uri.file('/path/to/file3');

describe('Tests for the CodeAnalyzerDiagnostic class', () => {
    describe('Tests for DiagnosticFactory.fromViolation method', () => {
        let diagnosticFactory: DiagnosticFactory;

        beforeEach(() => {
            diagnosticFactory = new DiagnosticFactory(new stubs.StubSettingsManager());
        });

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
            expect(() => diagnosticFactory.fromViolation(violation)).toThrow();
            violation.locations = [{}] // Case 2 - everything is undefined
            expect(() => diagnosticFactory.fromViolation(violation)).toThrow();
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

            const diag: CodeAnalyzerDiagnostic = diagnosticFactory.fromViolation(violation);
            expect(diag).not.toBeNull();
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

            const diag: CodeAnalyzerDiagnostic = diagnosticFactory.fromViolation(violation);
            expect(diag).not.toBeNull();
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
                    new vscode.Range(0, 0, 0, Number.MAX_SAFE_INTEGER-1)),
                'someDummyComment'));
            expect(diag.relatedInformation[2]).toEqual(new vscode.DiagnosticRelatedInformation(
                new vscode.Location(
                    vscode.Uri.file('/path/to/some/someFileWithSomeLineInfo.cls'),
                    new vscode.Range(0, 0, 17, Number.MAX_SAFE_INTEGER-1)),
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

            const diag: CodeAnalyzerDiagnostic = diagnosticFactory.fromViolation(violation);
            expect(diag).not.toBeNull();
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

            const diag: CodeAnalyzerDiagnostic = diagnosticFactory.fromViolation(violation);
            expect(diag).not.toBeNull();
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
        diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection, new stubs.StubSettingsManager());
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

    describe('Tests for clearDiagnosticsFromFile', () => {
        it('should remove diagnostics within a specified range', () => {
            const uri = sampleUri1;
            const diag1: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(uri, new vscode.Range(0, 0, 0, 1));
            const diag2: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(uri, new vscode.Range(1, 0, 1, 1));

            diagnosticManager.addDiagnostics([diag1, diag2]);
            const rangeToClear = new vscode.Range(0, 0, 0, 1);
            diagnosticManager.clearDiagnosticsFromFile(uri, { range: rangeToClear });

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
            diagnosticManager.clearDiagnosticsFromFile(uri, { range: rangeToClear });

            const diagnostics = diagnosticCollection.get(uri);
            expect(diagnostics).toHaveLength(2); // Both diagnostics should remain
        });
    });

    describe('Tests for refreshDiagnostics', () => {
        it('should do nothing when there are no diagnostics', () => {
            diagnosticManager.refreshDiagnostics();
            expect(diagnosticCollection.get(sampleUri1)).toEqual(undefined);
        });

        it('should update severity when severity setting changes from Warning to Error', () => {
            const stubSettingsManager = new stubs.StubSettingsManager();
            stubSettingsManager.getSeverityLevelReturnValue = vscode.DiagnosticSeverity.Warning;
            const managerWithStub = new DiagnosticManagerImpl(diagnosticCollection, stubSettingsManager);
            
            const violation: Violation = {
                rule: 'testRule',
                engine: 'pmd',
                message: 'test message',
                severity: 1,
                locations: [{
                    file: sampleUri1.fsPath,
                    startLine: 1
                }],
                primaryLocationIndex: 0,
                tags: [],
                resources: []
            };
            
            const diagnosticFactory = managerWithStub.diagnosticFactory;
            const initialDiag = diagnosticFactory.fromViolation(violation);
            managerWithStub.addDiagnostics([initialDiag]);
            
            expect(initialDiag.severity).toBe(vscode.DiagnosticSeverity.Warning);
            
            // Change severity setting to Error
            stubSettingsManager.getSeverityLevelReturnValue = vscode.DiagnosticSeverity.Error;
            managerWithStub.refreshDiagnostics();
            
            const refreshedDiags = diagnosticCollection.get(sampleUri1) as CodeAnalyzerDiagnostic[];
            expect(refreshedDiags).toHaveLength(1);
            expect(refreshedDiags[0].severity).toBe(vscode.DiagnosticSeverity.Error);
            expect(refreshedDiags[0].violation).toEqual(violation); // Violation data should be preserved
            expect(refreshedDiags[0].message).toBe(initialDiag.message); // Message should be preserved
        });

        it('should update severity when severity setting changes from Error to Warning', () => {
            const stubSettingsManager = new stubs.StubSettingsManager();
            stubSettingsManager.getSeverityLevelReturnValue = vscode.DiagnosticSeverity.Error;
            const managerWithStub = new DiagnosticManagerImpl(diagnosticCollection, stubSettingsManager);
            
            const violation: Violation = {
                rule: 'testRule',
                engine: 'pmd',
                message: 'test message',
                severity: 2,
                locations: [{
                    file: sampleUri1.fsPath,
                    startLine: 1
                }],
                primaryLocationIndex: 0,
                tags: [],
                resources: []
            };
            
            const diagnosticFactory = managerWithStub.diagnosticFactory;
            const initialDiag = diagnosticFactory.fromViolation(violation);
            managerWithStub.addDiagnostics([initialDiag]);
            
            expect(initialDiag.severity).toBe(vscode.DiagnosticSeverity.Error);
            
            // Change severity setting to Warning
            stubSettingsManager.getSeverityLevelReturnValue = vscode.DiagnosticSeverity.Warning;
            managerWithStub.refreshDiagnostics();
            
            const refreshedDiags = diagnosticCollection.get(sampleUri1) as CodeAnalyzerDiagnostic[];
            expect(refreshedDiags).toHaveLength(1);
            expect(refreshedDiags[0].severity).toBe(vscode.DiagnosticSeverity.Warning);
        });

        it('should refresh diagnostics across multiple files', () => {
            const stubSettingsManager = new stubs.StubSettingsManager();
            stubSettingsManager.getSeverityLevelReturnValue = vscode.DiagnosticSeverity.Warning;
            const managerWithStub = new DiagnosticManagerImpl(diagnosticCollection, stubSettingsManager);
            
            const violation1: Violation = {
                rule: 'rule1',
                engine: 'pmd',
                message: 'message1',
                severity: 1,
                locations: [{ file: sampleUri1.fsPath, startLine: 1 }],
                primaryLocationIndex: 0,
                tags: [],
                resources: []
            };
            
            const violation2: Violation = {
                rule: 'rule2',
                engine: 'eslint',
                message: 'message2',
                severity: 2,
                locations: [{ file: sampleUri2.fsPath, startLine: 2 }],
                primaryLocationIndex: 0,
                tags: [],
                resources: []
            };
            
            const diagnosticFactory = managerWithStub.diagnosticFactory;
            const diag1 = diagnosticFactory.fromViolation(violation1);
            const diag2 = diagnosticFactory.fromViolation(violation2);
            managerWithStub.addDiagnostics([diag1, diag2]);
            
            expect(diag1.severity).toBe(vscode.DiagnosticSeverity.Warning);
            expect(diag2.severity).toBe(vscode.DiagnosticSeverity.Warning);
            
            // Change severity setting to Error
            stubSettingsManager.getSeverityLevelReturnValue = vscode.DiagnosticSeverity.Error;
            managerWithStub.refreshDiagnostics();
            
            const refreshedDiags1 = diagnosticCollection.get(sampleUri1) as CodeAnalyzerDiagnostic[];
            const refreshedDiags2 = diagnosticCollection.get(sampleUri2) as CodeAnalyzerDiagnostic[];
            
            expect(refreshedDiags1).toHaveLength(1);
            expect(refreshedDiags1[0].severity).toBe(vscode.DiagnosticSeverity.Error);
            expect(refreshedDiags1[0].violation).toEqual(violation1);
            
            expect(refreshedDiags2).toHaveLength(1);
            expect(refreshedDiags2[0].severity).toBe(vscode.DiagnosticSeverity.Error);
            expect(refreshedDiags2[0].violation).toEqual(violation2);
        });

        it('should refresh multiple diagnostics in the same file', () => {
            const stubSettingsManager = new stubs.StubSettingsManager();
            stubSettingsManager.getSeverityLevelReturnValue = vscode.DiagnosticSeverity.Warning;
            const managerWithStub = new DiagnosticManagerImpl(diagnosticCollection, stubSettingsManager);
            
            const violation1: Violation = {
                rule: 'rule1',
                engine: 'pmd',
                message: 'message1',
                severity: 1,
                locations: [{ file: sampleUri1.fsPath, startLine: 1 }],
                primaryLocationIndex: 0,
                tags: [],
                resources: []
            };
            
            const violation2: Violation = {
                rule: 'rule2',
                engine: 'pmd',
                message: 'message2',
                severity: 3,
                locations: [{ file: sampleUri1.fsPath, startLine: 5 }],
                primaryLocationIndex: 0,
                tags: [],
                resources: []
            };
            
            const diagnosticFactory = managerWithStub.diagnosticFactory;
            const diag1 = diagnosticFactory.fromViolation(violation1);
            const diag2 = diagnosticFactory.fromViolation(violation2);
            managerWithStub.addDiagnostics([diag1, diag2]);
            
            expect(diag1.severity).toBe(vscode.DiagnosticSeverity.Warning);
            expect(diag2.severity).toBe(vscode.DiagnosticSeverity.Warning);
            
            // Change severity setting to Error
            stubSettingsManager.getSeverityLevelReturnValue = vscode.DiagnosticSeverity.Error;
            managerWithStub.refreshDiagnostics();
            
            const refreshedDiags = diagnosticCollection.get(sampleUri1) as CodeAnalyzerDiagnostic[];
            expect(refreshedDiags).toHaveLength(2);
            expect(refreshedDiags[0].severity).toBe(vscode.DiagnosticSeverity.Error);
            expect(refreshedDiags[1].severity).toBe(vscode.DiagnosticSeverity.Error);
            expect(refreshedDiags[0].violation).toEqual(violation1);
            expect(refreshedDiags[1].violation).toEqual(violation2);
        });

        it('should preserve all diagnostic properties except severity', () => {
            const stubSettingsManager = new stubs.StubSettingsManager();
            stubSettingsManager.getSeverityLevelReturnValue = vscode.DiagnosticSeverity.Warning;
            const managerWithStub = new DiagnosticManagerImpl(diagnosticCollection, stubSettingsManager);
            
            const violation: Violation = {
                rule: 'testRule',
                engine: 'pmd',
                message: 'test message',
                severity: 1,
                locations: [{
                    file: sampleUri1.fsPath,
                    startLine: 3,
                    startColumn: 5,
                    endLine: 3,
                    endColumn: 10
                }],
                primaryLocationIndex: 0,
                tags: [],
                resources: ['https://example.com']
            };
            
            const diagnosticFactory = managerWithStub.diagnosticFactory;
            const initialDiag = diagnosticFactory.fromViolation(violation);
            managerWithStub.addDiagnostics([initialDiag]);
            
            const initialRange = initialDiag.range;
            const initialCode = initialDiag.code;
            const initialSource = initialDiag.source;
            const initialUri = initialDiag.uri;
            
            // Change severity setting to Error
            stubSettingsManager.getSeverityLevelReturnValue = vscode.DiagnosticSeverity.Error;
            managerWithStub.refreshDiagnostics();
            
            const refreshedDiags = diagnosticCollection.get(sampleUri1) as CodeAnalyzerDiagnostic[];
            expect(refreshedDiags).toHaveLength(1);
            const refreshedDiag = refreshedDiags[0];
            
            // Severity should change
            expect(refreshedDiag.severity).toBe(vscode.DiagnosticSeverity.Error);
            expect(refreshedDiag.severity).not.toBe(initialDiag.severity);
            
            // All other properties should be preserved
            expect(refreshedDiag.range).toEqual(initialRange);
            expect(refreshedDiag.code).toEqual(initialCode);
            expect(refreshedDiag.source).toBe(initialSource);
            expect(refreshedDiag.uri.fsPath).toBe(initialUri.fsPath);
            expect(refreshedDiag.violation).toEqual(violation);
        });

        it('should preserve stale state when refreshing diagnostics', () => {
            const stubSettingsManager = new stubs.StubSettingsManager();
            stubSettingsManager.getSeverityLevelReturnValue = vscode.DiagnosticSeverity.Warning;
            const managerWithStub = new DiagnosticManagerImpl(diagnosticCollection, stubSettingsManager);
            
            const violation: Violation = {
                rule: 'testRule',
                engine: 'pmd',
                message: 'test message',
                severity: 1,
                locations: [{
                    file: sampleUri1.fsPath,
                    startLine: 1
                }],
                primaryLocationIndex: 0,
                tags: [],
                resources: []
            };
            
            const diagnosticFactory = managerWithStub.diagnosticFactory;
            const initialDiag = diagnosticFactory.fromViolation(violation);
            initialDiag.markStale(); // Mark as stale
            managerWithStub.addDiagnostics([initialDiag]);
            
            expect(initialDiag.isStale()).toBe(true);
            expect(initialDiag.severity).toBe(vscode.DiagnosticSeverity.Information);
            
            // Change severity setting to Error
            stubSettingsManager.getSeverityLevelReturnValue = vscode.DiagnosticSeverity.Error;
            managerWithStub.refreshDiagnostics();
            
            const refreshedDiags = diagnosticCollection.get(sampleUri1) as CodeAnalyzerDiagnostic[];
            expect(refreshedDiags).toHaveLength(1);
            const refreshedDiag = refreshedDiags[0];
            
            // Stale state should be preserved
            expect(refreshedDiag.isStale()).toBe(true);
            expect(refreshedDiag.severity).toBe(vscode.DiagnosticSeverity.Information);
            expect(refreshedDiag.message).toContain(messages.staleDiagnosticPrefix);
        });

        it('should not mark non-stale diagnostics as stale when refreshing', () => {
            const stubSettingsManager = new stubs.StubSettingsManager();
            stubSettingsManager.getSeverityLevelReturnValue = vscode.DiagnosticSeverity.Warning;
            const managerWithStub = new DiagnosticManagerImpl(diagnosticCollection, stubSettingsManager);
            
            const violation: Violation = {
                rule: 'testRule',
                engine: 'pmd',
                message: 'test message',
                severity: 1,
                locations: [{
                    file: sampleUri1.fsPath,
                    startLine: 1
                }],
                primaryLocationIndex: 0,
                tags: [],
                resources: []
            };
            
            const diagnosticFactory = managerWithStub.diagnosticFactory;
            const initialDiag = diagnosticFactory.fromViolation(violation);
            // Do NOT mark as stale
            managerWithStub.addDiagnostics([initialDiag]);
            
            expect(initialDiag.isStale()).toBe(false);
            
            // Change severity setting to Error
            stubSettingsManager.getSeverityLevelReturnValue = vscode.DiagnosticSeverity.Error;
            managerWithStub.refreshDiagnostics();
            
            const refreshedDiags = diagnosticCollection.get(sampleUri1) as CodeAnalyzerDiagnostic[];
            expect(refreshedDiags).toHaveLength(1);
            const refreshedDiag = refreshedDiags[0];
            
            // Should not be stale
            expect(refreshedDiag.isStale()).toBe(false);
            expect(refreshedDiag.severity).toBe(vscode.DiagnosticSeverity.Error);
        });
    });
});
