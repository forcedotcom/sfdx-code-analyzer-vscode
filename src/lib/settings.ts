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
    getAnalyzeAutomaticallyFileExtensions(): Set<string>;

    // Configuration Settings
    getCodeAnalyzerConfigFile(): string;
    getCodeAnalyzerRuleSelectors(): string;
    getSeverityLevel(severity: number): vscode.DiagnosticSeverity;

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

    public getAnalyzeAutomaticallyFileExtensions(): Set<string> {
        const fileTypesString = vscode.workspace.getConfiguration('codeAnalyzer.analyzeAutomatically').get<string>('fileTypes');
        // Parse comma-separated string, normalize to lowercase, and deduplicate
        // VS Code's pattern validation ensures the format is correct
        const extensions = fileTypesString
            .split(',')
            .map(ext => ext.trim().toLowerCase())
            .filter(ext => ext.length > 0);
        
        return new Set(extensions);
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

    // =================================================================================================================
    // ==== Diagnostic Levels Settings
    // =================================================================================================================
    /**
     * Maps configuration string values to VSCode diagnostic severity
     * @returns VSCode diagnostic severity (Error, Warning, or Information)
     */
    private mapToDiagnosticSeverity(configValue: string): vscode.DiagnosticSeverity {
        switch (configValue) {
            case 'Error':
                return vscode.DiagnosticSeverity.Error;
            case 'Warning':
                return vscode.DiagnosticSeverity.Warning;
            case 'Info':
                return vscode.DiagnosticSeverity.Information;
            default:
                return vscode.DiagnosticSeverity.Warning;
        }
    }

    public getSeverityLevel(severity: number): vscode.DiagnosticSeverity {
        const configValue = vscode.workspace.getConfiguration('codeAnalyzer').get<string>(`severity ${severity}`) || 'Warning';
        return this.mapToDiagnosticSeverity(configValue);
    }

    // =================================================================================================================
    // ==== Other Settings that we may depend on
    // =================================================================================================================
    public getEditorCodeLensEnabled(): boolean {
        return vscode.workspace.getConfiguration('editor').get('codeLens');
    }
}
