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

    describe('Editor Settings', () => {
        it('should get codeLens setting', () => {
            getMock.mockReturnValue(true);
            expect(settingsManager.getEditorCodeLensEnabled()).toBe(true);
            expect(getMock).toHaveBeenCalledWith('codeLens');
        });
    });
});
