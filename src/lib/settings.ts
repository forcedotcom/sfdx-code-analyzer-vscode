/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';

/**
 * Class for accessing the values of configuration settings
 */
export class SettingsManager {
    public static getPmdCustomConfigFile(): string {
        return vscode.workspace.getConfiguration('codeAnalyzer.pMD').get('customConfigFile');
    }

    public static getGraphEngineDisableWarningViolations(): boolean {
        return vscode.workspace.getConfiguration('codeAnalyzer.graphEngine').get('disableWarningViolations');
    }

    public static getGraphEngineThreadTimeout(): number {
        return vscode.workspace.getConfiguration('codeAnalyzer.graphEngine').get('threadTimeout');
    }

    public static getGraphEnginePathExpansionLimit(): number {
        return vscode.workspace.getConfiguration('codeAnalyzer.graphEngine').get('pathExpansionLimit');
    }

    public static getGraphEngineJvmArgs(): string {
        return vscode.workspace.getConfiguration('codeAnalyzer.graphEngine').get('jvmArgs');
    }

    public static getAnalyzeOnSave(): boolean {
        return vscode.workspace.getConfiguration('codeAnalyzer.analyzeOnSave').get('enabled');
    }

    public static getAnalyzeOnOpen(): boolean {
        return vscode.workspace.getConfiguration('codeAnalyzer.analyzeOnOpen').get('enabled');
    }

    public static getEnginesToRun(): string {
        return vscode.workspace.getConfiguration('codeAnalyzer.scanner').get('engines');
    }

    public static getNormalizeSeverityEnabled(): boolean {
        return vscode.workspace.getConfiguration('codeAnalyzer.normalizeSeverity').get('enabled');
    }

    public static getRulesCategory(): string {
        return vscode.workspace.getConfiguration('codeAnalyzer.rules').get('category');
    }

    public static getApexGuruEnabled(): boolean {
        return vscode.workspace.getConfiguration('codeAnalyzer.apexGuru').get('enabled');
    }

    public static getSfgePartialSfgeRunsEnabled(): boolean {
        return vscode.workspace.getConfiguration('codeAnalyzer.partialGraphEngineScans').get('enabled');
    }
}