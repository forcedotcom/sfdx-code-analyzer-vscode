import * as vscode from 'vscode';
import {SettingsManagerImpl} from "../../../lib/settings";

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

        it('should get apexGuruEnabled', () => {
            getMock.mockReturnValue(true);
            expect(settingsManager.getApexGuruEnabled()).toBe(true);
            expect(getMock).toHaveBeenCalledWith('enabled');
        });

        it('should get useV4Deprecated', () => {
            getMock.mockReturnValue(false);
            expect(settingsManager.getCodeAnalyzerUseV4Deprecated()).toBe(false);
            expect(getMock).toHaveBeenCalledWith('Use v4 (Deprecated)');
        });

        it('should set useV4Deprecated and remove it at other levels', () => {
            settingsManager.setCodeAnalyzerUseV4Deprecated(true);
            expect(updateMock).toHaveBeenNthCalledWith(1, 'Use v4 (Deprecated)', true, vscode.ConfigurationTarget.Global);
            expect(updateMock).toHaveBeenNthCalledWith(2, 'Use v4 (Deprecated)', undefined, vscode.ConfigurationTarget.Workspace);
            expect(updateMock).toHaveBeenNthCalledWith(3, 'Use v4 (Deprecated)', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
        });
    });

    describe('v5 Settings', () => {
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

    describe('v4 Settings (Deprecated)', () => {
        it('should get PMD custom config file', () => {
            getMock.mockReturnValue('custom-config.xml');
            expect(settingsManager.getPmdCustomConfigFile()).toBe('custom-config.xml');
            expect(getMock).toHaveBeenCalledWith('customConfigFile');
        });

        it('should get disableWarningViolations', () => {
            getMock.mockReturnValue(true);
            expect(settingsManager.getGraphEngineDisableWarningViolations()).toBe(true);
            expect(getMock).toHaveBeenCalledWith('disableWarningViolations');
        });

        it('should get threadTimeout', () => {
            getMock.mockReturnValue(1234);
            expect(settingsManager.getGraphEngineThreadTimeout()).toBe(1234);
            expect(getMock).toHaveBeenCalledWith('threadTimeout');
        });

        it('should get pathExpansionLimit', () => {
            getMock.mockReturnValue(25);
            expect(settingsManager.getGraphEnginePathExpansionLimit()).toBe(25);
            expect(getMock).toHaveBeenCalledWith('pathExpansionLimit');
        });

        it('should get jvmArgs', () => {
            getMock.mockReturnValue('-Xmx1024m');
            expect(settingsManager.getGraphEngineJvmArgs()).toBe('-Xmx1024m');
            expect(getMock).toHaveBeenCalledWith('jvmArgs');
        });

        it('should get enginesToRun', () => {
            getMock.mockReturnValue('engine1,engine2');
            expect(settingsManager.getEnginesToRun()).toBe('engine1,engine2');
            expect(getMock).toHaveBeenCalledWith('engines');
        });

        it('should get normalizeSeverityEnabled', () => {
            getMock.mockReturnValue(true);
            expect(settingsManager.getNormalizeSeverityEnabled()).toBe(true);
            expect(getMock).toHaveBeenCalledWith('enabled');
        });

        it('should get rulesCategory', () => {
            getMock.mockReturnValue('Best Practices');
            expect(settingsManager.getRulesCategory()).toBe('Best Practices');
            expect(getMock).toHaveBeenCalledWith('category');
        });

        it('should get partialSfgeRunsEnabled', () => {
            getMock.mockReturnValue(true);
            expect(settingsManager.getSfgePartialSfgeRunsEnabled()).toBe(true);
            expect(getMock).toHaveBeenCalledWith('enabled');
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
