/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';

export interface SettingsManager {
	getCodeAnalyzerV5Enabled(): boolean;

    getPmdCustomConfigFile(): string;

    getGraphEngineDisableWarningViolations(): boolean;

    getGraphEngineThreadTimeout(): number;

    getGraphEnginePathExpansionLimit(): number;

    getGraphEngineJvmArgs(): string;

    getAnalyzeOnSave(): boolean;

    getAnalyzeOnOpen(): boolean;

    getEnginesToRun(): string;

    getNormalizeSeverityEnabled(): boolean;

    getRulesCategory(): string;

    getApexGuruEnabled(): boolean;

    getSfgePartialSfgeRunsEnabled(): boolean;
}

export class SettingsManagerImpl implements SettingsManager {
	public getCodeAnalyzerV5Enabled(): boolean {
		return vscode.workspace.getConfiguration('codeAnalyzer').get('enableV5');
	}

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

    public getAnalyzeOnSave(): boolean {
        return vscode.workspace.getConfiguration('codeAnalyzer.analyzeOnSave').get('enabled');
    }

    public getAnalyzeOnOpen(): boolean {
        return vscode.workspace.getConfiguration('codeAnalyzer.analyzeOnOpen').get('enabled');
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

    public getApexGuruEnabled(): boolean {
        return vscode.workspace.getConfiguration('codeAnalyzer.apexGuru').get('enabled');
    }

    public getSfgePartialSfgeRunsEnabled(): boolean {
        return vscode.workspace.getConfiguration('codeAnalyzer.partialGraphEngineScans').get('enabled');
    }
}
