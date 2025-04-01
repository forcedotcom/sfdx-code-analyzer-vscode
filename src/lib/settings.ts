/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';

export interface SettingsManager {
    // General Settings
    getAnalyzeOnOpen(): boolean;
    getAnalyzeOnSave(): boolean;
    getApexGuruEnabled(): boolean;
    getCodeAnalyzerUseV4Deprecated(): boolean;
    setCodeAnalyzerUseV4Deprecated(value: boolean): void;

    // v5 Settings
    getCodeAnalyzerConfigFile(): string;
    getCodeAnalyzerRuleSelectors(): string;

    // v4 Settings (Deprecated)
    getPmdCustomConfigFile(): string;
    getGraphEngineDisableWarningViolations(): boolean;
    getGraphEngineThreadTimeout(): number;
    getGraphEnginePathExpansionLimit(): number;
    getGraphEngineJvmArgs(): string;
    getEnginesToRun(): string;
    getNormalizeSeverityEnabled(): boolean;
    getRulesCategory(): string;
    getSfgePartialSfgeRunsEnabled(): boolean;
}

export class SettingsManagerImpl implements SettingsManager {
    // =================================================================================================================
    // ==== General Settings
    // =================================================================================================================
    public getAnalyzeOnOpen(): boolean {
        return vscode.workspace.getConfiguration('codeAnalyzer.analyzeOnOpen').get('enabled');
    }

    public getAnalyzeOnSave(): boolean {
        return vscode.workspace.getConfiguration('codeAnalyzer.analyzeOnSave').get('enabled');
    }

    public getApexGuruEnabled(): boolean {
        return vscode.workspace.getConfiguration('codeAnalyzer.apexGuru').get('enabled');
    }

    public getCodeAnalyzerUseV4Deprecated(): boolean {
        return vscode.workspace.getConfiguration('codeAnalyzer').get('useV4Deprecated');
    }

    public setCodeAnalyzerUseV4Deprecated(value: boolean): void {
        void vscode.workspace.getConfiguration('codeAnalyzer').update('useV4Deprecated', value, vscode.ConfigurationTarget.Global);
    }


    // =================================================================================================================
    // ==== v5 Settings
    // =================================================================================================================
    public getCodeAnalyzerConfigFile(): string {
        return vscode.workspace.getConfiguration('codeAnalyzer').get('configFile');
    }

    public getCodeAnalyzerRuleSelectors(): string {
        return vscode.workspace.getConfiguration('codeAnalyzer').get('ruleSelectors');
    }


    // =================================================================================================================
    // ==== v4 Settings (Deprecated)
    // =================================================================================================================
    public getPmdCustomConfigFile(): string {
        return vscode.workspace.getConfiguration('codeAnalyzer.pMD').get('customConfigFile');
    }

    public getGraphEngineDisableWarningViolations(): boolean {
        return vscode.workspace.getConfiguration('codeAnalyzer.graphEngine').get('disableWarningViolations');
    }


    public getGraphEngineThreadTimeout(): number {
        return vscode.workspace.getConfiguration('codeAnalyzer.graphEngine').get('threadTimeout');
    }

    public getGraphEnginePathExpansionLimit(): number {
        return vscode.workspace.getConfiguration('codeAnalyzer.graphEngine').get('pathExpansionLimit');
    }

    public getGraphEngineJvmArgs(): string {
        return vscode.workspace.getConfiguration('codeAnalyzer.graphEngine').get('jvmArgs');
    }

    public getEnginesToRun(): string {
        return vscode.workspace.getConfiguration('codeAnalyzer.scanner').get('engines');
    }

    public getNormalizeSeverityEnabled(): boolean {
        return vscode.workspace.getConfiguration('codeAnalyzer.normalizeSeverity').get('enabled');
    }

    public getRulesCategory(): string {
        return vscode.workspace.getConfiguration('codeAnalyzer.rules').get('category');
    }

    public getSfgePartialSfgeRunsEnabled(): boolean {
        return vscode.workspace.getConfiguration('codeAnalyzer.partialGraphEngineScans').get('enabled');
    }
}
