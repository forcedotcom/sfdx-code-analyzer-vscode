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

    // Configuration Settings
    getCodeAnalyzerConfigFile(): string;
    getCodeAnalyzerRuleSelectors(): string;
    getSeverity1(): string;
    getSeverity2(): string;
    getSeverity3(): string;
    getSeverity4(): string;
    getSeverity5(): string;

    // Other Settings that we may depend on
    getEditorCodeLensEnabled(): boolean;
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

    // =================================================================================================================
    // ==== Configuration Settings
    // =================================================================================================================
    public getCodeAnalyzerConfigFile(): string {
        return vscode.workspace.getConfiguration('codeAnalyzer').get('configFile');
    }

    public getCodeAnalyzerRuleSelectors(): string {
        return vscode.workspace.getConfiguration('codeAnalyzer').get('ruleSelectors');
    }

    public getSeverity1(): string {
        return vscode.workspace.getConfiguration('codeAnalyzer').get('severity 1', 'Warning');
    }

    public getSeverity2(): string {
        return vscode.workspace.getConfiguration('codeAnalyzer').get('severity 2', 'Warning');
    }

    public getSeverity3(): string {
        return vscode.workspace.getConfiguration('codeAnalyzer').get('severity 3', 'Warning');
    }

    public getSeverity4(): string {
        return vscode.workspace.getConfiguration('codeAnalyzer').get('severity 4', 'Warning');
    }

    public getSeverity5(): string {
        return vscode.workspace.getConfiguration('codeAnalyzer').get('severity 5', 'Warning');
    }

    // =================================================================================================================
    // ==== Other Settings that we may depend on
    // =================================================================================================================
    public getEditorCodeLensEnabled(): boolean {
        return vscode.workspace.getConfiguration('editor').get('codeLens');
    }
}
