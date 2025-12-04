import * as vscode from "vscode";// The vscode module is mocked out. See: scripts/setup.jest.ts

import * as stubs from "../../stubs";
import { CodeAnalyzerDiagnostic, DiagnosticFactory, DiagnosticManager, DiagnosticManagerImpl, Violation } from "../../../src/lib/diagnostics";
import { FakeDiagnosticCollection } from "../../vscode-stubs";
import { ApexGuruRunAction } from "../../../src/lib/apexguru/apex-guru-run-action";
import { createSampleCodeAnalyzerDiagnostic } from "../../test-utils";
import { ApexGuruAccess } from "../../../src/lib/apexguru/apex-guru-service";

describe("Tests for ApexGuruRunAction", () => {
    const sampleUri: vscode.Uri = vscode.Uri.file('/some/file.cls');
    const samplePmdDiag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(
        sampleUri, new vscode.Range(0,0,1,0), 'somePmdRule', 'pmd');
    const sampleApexGuruDiag: CodeAnalyzerDiagnostic = createSampleCodeAnalyzerDiagnostic(
        sampleUri, new vscode.Range(2,0,2,6), 'someApexGuruRule', 'apexguru');

    let taskWithProgressRunner: stubs.FakeTaskWithProgressRunner;
    let apexGuruService: stubs.StubApexGuruService;
    let diagnosticCollection: vscode.DiagnosticCollection;
    let diagnosticManager: DiagnosticManager;
    let diagnosticFactory: DiagnosticFactory;
    let telemetryService: stubs.SpyTelemetryService;
    let display: stubs.SpyDisplay;
    let apexGuruRunAction: ApexGuruRunAction;
    
    beforeEach(() => {
        taskWithProgressRunner = new stubs.FakeTaskWithProgressRunner();
        apexGuruService = new stubs.StubApexGuruService();
        diagnosticCollection = new FakeDiagnosticCollection();
        const settingsManager = new stubs.StubSettingsManager();
        diagnosticManager = new DiagnosticManagerImpl(diagnosticCollection, settingsManager);
        diagnosticFactory = (diagnosticManager as DiagnosticManagerImpl).diagnosticFactory;
        diagnosticManager.addDiagnostics([samplePmdDiag, sampleApexGuruDiag]); // Start with some sample diagnostics
        telemetryService = new stubs.SpyTelemetryService();
        display = new stubs.SpyDisplay();
        apexGuruRunAction = new ApexGuruRunAction(
            taskWithProgressRunner, apexGuruService, diagnosticManager, diagnosticFactory, telemetryService, display);
    });

    it("When ApexGuru scan throws error, then display error in error window and send exception telemetry event", async () => {
        const throwingService = new stubs.ThrowingScanApexGuruService();
        const throwingDiagnosticManager = new DiagnosticManagerImpl(new FakeDiagnosticCollection(), new stubs.StubSettingsManager());
        const throwingDiagnosticFactory = throwingDiagnosticManager.diagnosticFactory;
        apexGuruRunAction = new ApexGuruRunAction(
            taskWithProgressRunner, throwingService, throwingDiagnosticManager, throwingDiagnosticFactory, telemetryService, display);
        
        await apexGuruRunAction.run('SomeCommandName', sampleUri);

        // First the progress bar should have shown
        expect(taskWithProgressRunner.progressReporter.reportProgressCallHistory).toHaveLength(1);
        expect(taskWithProgressRunner.progressReporter.reportProgressCallHistory[0].progressEvent).toEqual({
            message: "Code Analyzer is running ApexGuru analysis."
        });

        // Then the progress bar is removed (no way to unit test that) and an error is shown
        expect(display.displayErrorCallHistory).toHaveLength(1);
        expect(display.displayErrorCallHistory[0].msg).toEqual('Analysis failed: Sample error message from scan method');

        // Then telemetry should have been sent
        expect(telemetryService.sendExceptionCallHistory).toHaveLength(1);
        expect(telemetryService.sendExceptionCallHistory[0].name).toEqual('sfdx__apexguru_file_run_failed');
        expect(telemetryService.sendExceptionCallHistory[0].properties.executedCommand).toEqual('SomeCommandName');
        expect(telemetryService.sendExceptionCallHistory[0].errorMessage).toContain('Error: Sample error message from scan method');

        // Also validate that we didn't modify the existing diagnostics at all
        expect(diagnosticManager.getDiagnosticsForFile(sampleUri)).toEqual([samplePmdDiag, sampleApexGuruDiag]);
    });

    it("When user's org is eligible but not enabled, then ApexGuru scan button results in an error window with instructions", async () => {
        apexGuruService.getAvailabilityReturnValue = {
            access: ApexGuruAccess.ELIGIBLE,
            message: "Some instructions from ApexGuru"
        };

        await apexGuruRunAction.run('SomeCommandName', sampleUri);

        // No progress bar should be shown
        expect(taskWithProgressRunner.progressReporter.reportProgressCallHistory).toHaveLength(0);

        // A error dialog should be given with the instructions that were sent from the ApexGuru service
        expect(display.displayErrorCallHistory).toHaveLength(1);
        expect(display.displayErrorCallHistory[0].msg).toEqual('Some instructions from ApexGuru');

        // Then telemetry should have been sent
        expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
        expect(telemetryService.sendCommandEventCallHistory[0].commandName).toEqual('sfdx__apexguru_file_run_not_enabled');
        expect(telemetryService.sendCommandEventCallHistory[0].properties).toEqual({
            access: 'eligible-but-not-enabled',
            executedCommand: 'SomeCommandName'
        });

        // Also validate that we didn't modify the existing diagnostics at all
        expect(diagnosticManager.getDiagnosticsForFile(sampleUri)).toEqual([samplePmdDiag, sampleApexGuruDiag]);
    });

    it("When ApexGuru scan results in zero violations, then display this information, send telemetry event, and update diagnostics", async () => {
        apexGuruService.scanReturnValue = [];

        await apexGuruRunAction.run('SomeCommandName', sampleUri);

        // First the progress bar should have shown
        expect(taskWithProgressRunner.progressReporter.reportProgressCallHistory).toHaveLength(2);
        expect(taskWithProgressRunner.progressReporter.reportProgressCallHistory[0].progressEvent).toEqual({
            message: "Code Analyzer is running ApexGuru analysis."
        });
        expect(taskWithProgressRunner.progressReporter.reportProgressCallHistory[1].progressEvent).toEqual({
            message: "Code Analyzer is processing results.",
            increment: 90
        });

        // Then the progress bar is removed (no way to unit test that) and info of results is shown
        expect(display.displayErrorCallHistory).toHaveLength(0); // Sanity check no errors
        expect(display.displayWarningCallHistory).toHaveLength(0); // Sanity check no warnings
        expect(display.displayInfoCallHistory).toHaveLength(1);
        expect(display.displayInfoCallHistory[0].msg).toEqual('Scan complete. 0 violations found.');

        // Then telemetry should have been sent
        expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
        expect(telemetryService.sendCommandEventCallHistory[0].commandName).toEqual("sfdx__apexguru_file_run_complete");
        expect(telemetryService.sendCommandEventCallHistory[0].properties.executedCommand).toEqual("SomeCommandName");
        expect(telemetryService.sendCommandEventCallHistory[0].properties.numViolations).toEqual("0");
        expect(telemetryService.sendCommandEventCallHistory[0].properties.numViolationsWithSuggestions).toEqual("0");
        expect(telemetryService.sendCommandEventCallHistory[0].properties.numViolationsWithFixes).toEqual("0");

        // Also validate that we removed the old apexguru diagnostic(s) but kept the old non-apexguru diagnostic(s)
        expect(diagnosticManager.getDiagnosticsForFile(sampleUri)).toEqual([samplePmdDiag]);
    });

    it("When ApexGuru scan results in multiple violations, then display this information, send telemetry event, and update diagnostics", async () => {
        const violation1: Violation = {
            rule: "SomeRule1",
            engine: "apexguru",
            message: "dummy message 1",
            severity: 3,
            locations: [{
                file: sampleUri.fsPath,
                startLine: 5,
            }],
            primaryLocationIndex: 0,
            tags: [],
            resources: ["https://www.example1.com"],
            suggestions: [
                {
                    message: "sample suggestion",
                    location: {
                        file: sampleUri.fsPath,
                        startLine: 5
                    }
                }
            ]
        };
        const violation2: Violation = {
            rule: "SomeRule2",
            engine: "apexguru",
            message: "dummy message 2",
            severity: 4,
            locations: [{
                file: sampleUri.fsPath,
                startLine: 7,
                endLine: 9
            }],
            primaryLocationIndex: 0,
            tags: [],
            resources: ["https://www.example2.com"]
        }
        const violation3: Violation = {
            rule: "SomeRule3",
            engine: "apexguru",
            message: "dummy message 3",
            severity: 4,
            locations: [{
                file: sampleUri.fsPath,
                startLine: 7,
                endLine: 9
            }],
            primaryLocationIndex: 0,
            tags: [],
            resources: ["https://www.example3.com"],
            suggestions: [
                {
                    message: "sample suggestion 1",
                    location: {
                        file: sampleUri.fsPath,
                        startLine: 7
                    }
                },
                {
                    message: "sample suggestion 2",
                    location: {
                        file: sampleUri.fsPath,
                        startLine: 8
                    }
                },
            ],
            fixes: [
                {
                    fixedCode: "SomeFixedCode",
                    location: {
                        file: sampleUri.fsPath,
                        startLine: 9
                    }
                }
            ]
        }
        apexGuruService.scanReturnValue = [violation1, violation2, violation3];

        await apexGuruRunAction.run('SomeCommandName', sampleUri);

        // First the progress bar should have shown
        expect(taskWithProgressRunner.progressReporter.reportProgressCallHistory).toHaveLength(2);
        expect(taskWithProgressRunner.progressReporter.reportProgressCallHistory[0].progressEvent).toEqual({
            message: "Code Analyzer is running ApexGuru analysis."
        });
        expect(taskWithProgressRunner.progressReporter.reportProgressCallHistory[1].progressEvent).toEqual({
            message: "Code Analyzer is processing results.",
            increment: 90
        });

        // Then the progress bar is removed (no way to unit test that) and info of results is shown
        expect(display.displayErrorCallHistory).toHaveLength(0); // Sanity check no errors
        expect(display.displayWarningCallHistory).toHaveLength(0); // Sanity check no warnings
        expect(display.displayInfoCallHistory).toHaveLength(1);
        expect(display.displayInfoCallHistory[0].msg).toEqual('Scan complete. 3 violations found.');

        // Then telemetry should have been sent
        expect(telemetryService.sendCommandEventCallHistory).toHaveLength(1);
        expect(telemetryService.sendCommandEventCallHistory[0].commandName).toEqual("sfdx__apexguru_file_run_complete");
        expect(telemetryService.sendCommandEventCallHistory[0].properties.executedCommand).toEqual("SomeCommandName");
        expect(telemetryService.sendCommandEventCallHistory[0].properties.numViolations).toEqual("3");
        expect(telemetryService.sendCommandEventCallHistory[0].properties.numViolationsWithSuggestions).toEqual("2");
        expect(telemetryService.sendCommandEventCallHistory[0].properties.numViolationsWithFixes).toEqual("1");

        // Also validate that we removed the old apexguru diagnostic(s) but kept the other(s)
        const actDiags: readonly CodeAnalyzerDiagnostic[] = diagnosticManager.getDiagnosticsForFile(sampleUri);
        const expDiags: CodeAnalyzerDiagnostic[] = [
            samplePmdDiag, 
            diagnosticFactory.fromViolation(violation1),
            diagnosticFactory.fromViolation(violation2), 
            diagnosticFactory.fromViolation(violation3)
        ].filter((d): d is CodeAnalyzerDiagnostic => d !== null);
        expectEquivalentDiagnostics(actDiags, expDiags);
    });
});

function expectEquivalentDiagnostics(actDiags: readonly vscode.Diagnostic[], expDiags: readonly vscode.Diagnostic[]): void {
    // Using stringify to check for equivalence because toEqual directly ont he arrays fails due to some of the
    // properties (maybe the range) not being the exact same instance.
    expect(JSON.stringify(actDiags, null, 2)).toEqual(JSON.stringify(expDiags, null, 2));
}