import * as vscode from 'vscode';
import {SettingsManagerImpl} from "../../src/lib/settings";

describe('Tests for the SettingsManagerImpl class ', () => {
    let settingsManager: SettingsManagerImpl;
    let getMock: jest.Mock;
    let updateMock: jest.Mock;

    beforeEach(() => {
        settingsManager = new SettingsManagerImpl();

        // Clear and prepare mocks
        getMock = jest.fn();
        updateMock = jest.fn();

        (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((_section: string) => {
            return {
                get: getMock,
                update: updateMock,
            };
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('General Settings', () => {
        it('should get analyzeOnOpen', () => {
            getMock.mockReturnValue(true);
            expect(settingsManager.getAnalyzeOnOpen()).toBe(true);
            expect(getMock).toHaveBeenCalledWith('enabled');
        });

        it('should get analyzeOnSave', () => {
            getMock.mockReturnValue(false);
            expect(settingsManager.getAnalyzeOnSave()).toBe(false);
            expect(getMock).toHaveBeenCalledWith('enabled');
        });

        it('should parse comma-separated fileExtensions', () => {
            const extensionsString = '.cls,.js,.apex';
            getMock.mockReturnValue(extensionsString);
            const result: Set<string> = settingsManager.getAnalyzeAutomaticallyFileExtensions();
            expect(result).toEqual(new Set(['.cls', '.js', '.apex']));
            expect(getMock).toHaveBeenCalledWith('fileTypes');
        });

        it('should normalize extensions to lowercase', () => {
            const extensionsString = '.CLS,.JS,.APEX';
            getMock.mockReturnValue(extensionsString);
            const result: Set<string> = settingsManager.getAnalyzeAutomaticallyFileExtensions();
            expect(result).toEqual(new Set(['.cls', '.js', '.apex']));
            expect(getMock).toHaveBeenCalledWith('fileTypes');
        });

        it('should remove duplicate extensions', () => {
            const extensionsString = '.cls,.js,.cls,.apex,.js';
            getMock.mockReturnValue(extensionsString);
            const result: Set<string> = settingsManager.getAnalyzeAutomaticallyFileExtensions();
            expect(result).toEqual(new Set(['.cls', '.js', '.apex']));
            expect(getMock).toHaveBeenCalledWith('fileTypes');
        });

        it('should remove duplicates after case normalization', () => {
            const extensionsString = '.cls,.CLS,.Cls,.js,.JS';
            getMock.mockReturnValue(extensionsString);
            const result: Set<string> = settingsManager.getAnalyzeAutomaticallyFileExtensions();
            expect(result).toEqual(new Set(['.cls', '.js']));
            expect(getMock).toHaveBeenCalledWith('fileTypes');
        });
    });

    describe('Configuration Settings', () => {
        it('should get configFile', () => {
            getMock.mockReturnValue('path/to/config');
            expect(settingsManager.getCodeAnalyzerConfigFile()).toBe('path/to/config');
            expect(getMock).toHaveBeenCalledWith('configFile');
        });

        it('should get ruleSelectors', () => {
            getMock.mockReturnValue('rules');
            expect(settingsManager.getCodeAnalyzerRuleSelectors()).toBe('rules');
            expect(getMock).toHaveBeenCalledWith('ruleSelectors');
        });
    });

    describe('Diagnostic Levels Settings', () => {
        it('should map "Error" to DiagnosticSeverity.Error', () => {
            getMock.mockReturnValue('Error');
            const result = settingsManager.getSeverityLevel(1);
            expect(result).toBe(vscode.DiagnosticSeverity.Error);
            expect(getMock).toHaveBeenCalledWith('severity 1');
        });

        it('should map "Warning" to DiagnosticSeverity.Warning', () => {
            getMock.mockReturnValue('Warning');
            const result = settingsManager.getSeverityLevel(2);
            expect(result).toBe(vscode.DiagnosticSeverity.Warning);
            expect(getMock).toHaveBeenCalledWith('severity 2');
        });

        it('should default to Warning for unknown values', () => {
            getMock.mockReturnValue('UnknownValue');
            const result = settingsManager.getSeverityLevel(5);
            expect(result).toBe(vscode.DiagnosticSeverity.Warning);
            expect(getMock).toHaveBeenCalledWith('severity 5');
        });

        it('should default to Warning when config value is null', () => {
            getMock.mockReturnValue(null);
            const result = settingsManager.getSeverityLevel(1);
            expect(result).toBe(vscode.DiagnosticSeverity.Warning);
            expect(getMock).toHaveBeenCalledWith('severity 1');
        });

        it('should default to Warning when config value is undefined', () => {
            getMock.mockReturnValue(undefined);
            const result = settingsManager.getSeverityLevel(2);
            expect(result).toBe(vscode.DiagnosticSeverity.Warning);
            expect(getMock).toHaveBeenCalledWith('severity 2');
        });

        it('should handle different severity numbers', () => {
            getMock.mockReturnValue('Error');
            expect(settingsManager.getSeverityLevel(1)).toBe(vscode.DiagnosticSeverity.Error);
            expect(settingsManager.getSeverityLevel(2)).toBe(vscode.DiagnosticSeverity.Error);
            expect(settingsManager.getSeverityLevel(5)).toBe(vscode.DiagnosticSeverity.Error);
            expect(getMock).toHaveBeenCalledWith('severity 1');
            expect(getMock).toHaveBeenCalledWith('severity 2');
            expect(getMock).toHaveBeenCalledWith('severity 5');
        });
    });

    describe('Editor Settings', () => {
        it('should get codeLens setting', () => {
            getMock.mockReturnValue(true);
            expect(settingsManager.getEditorCodeLensEnabled()).toBe(true);
            expect(getMock).toHaveBeenCalledWith('codeLens');
        });
    });
});
