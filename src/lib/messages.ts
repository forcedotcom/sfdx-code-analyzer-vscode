/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
export const messages = {
    scanProgressReport: {
        identifyingTargets: {
            message: "Code Analyzer is identifying targets.",
            increment: 10
        },
        analyzingTargets: {
            message: "Code Analyzer is analyzing targets.",
            increment: 20
        },
        processingResults: {
            message: "Code Analyzer is processing results.",
            increment: 60
        }
    },
    apexGuru: {
        progress: {
            message: "Code Analyzer running ApexGuru analysis."
        },
        finishedScan: (violationCount: number) => `Scan complete. ${violationCount} violations found.`
    },
    info: {
        finishedScan: (scannedCount: number, badFileCount: number, violationCount: number) => `Scan complete. Analyzed ${scannedCount} files. ${violationCount} violations found in ${badFileCount} files.`
    },
    graphEngine: {
        noViolationsFound: "Scan was completed. No violations found.",
        resultsTab: "Graph Engine Results",
        spinnerText: 'Running Graph Engine analysis...',
        statusBarName: "Graph Engine Analysis",
        noDfaRun: "We didn't find a running Salesforce Graph Engine analysis, so nothing was canceled.",
        dfaRunStopped: "Salesforce Graph Engine analysis canceled.",
        existingDfaRunText: "A Salesforce Graph Engine analysis is already running. Cancel it by clicking in the Status Bar.",
    },
    fixer: {
        supressOnLine: "Suppress violations on this line.",
        supressOnClass: "Suppress violations on this class.",
        fixWithApexGuruSuggestions: "***Fix violations with suggestions from Apex Guru***"
    },
    diagnostics: {
        messageGenerator: (severity: number, message: string) => `Sev${severity}: ${message}`,
        source: {
            generator: (engine: string) => `${engine} via Code Analyzer`,
            isSource: (source: string) => {
                if (!source) {
                    return false;
                }
                return source && source.endsWith(' via Code Analyzer');
            },
            extractEngine: (source: string) => source?.split(' ')[0]
        }
    },
    targeting: {
        warnings: {
            apexLspUnavailable: "Apex Language Server is unavailable. Defaulting to strict targeting."
        },
        error: {
            nonexistentSelectedFileGenerator: (file: string) => `Selected file doesn't exist: ${file}`,
            noFileSelected: "Select a file to scan",
            noMethodIdentified: "Select a single method to run Graph Engine path-based analysis."
        }
    },
    error: {
        analysisFailedGenerator: (reason: string) => `Analysis failed: ${reason}`,
        pmdConfigNotFoundGenerator: (file: string) => `PMD custom config file couldn't be located. [${file}]. Check Salesforce Code Analyzer > PMD > Custom Config settings`,
        sfMissing: "To use this extension, first install Salesforce CLI `sf` or `sfdx` commands.",
        sfdxScannerMissing: "To use this extension, first install `@salesforce/sfdx-scanner`.",
		coreExtensionServiceUninitialized: "CoreExtensionService.ts didn't initialize. Log a new issue on Salesforce Code Analyzer VS Code extension repo: https://github.com/forcedotcom/sfdx-code-analyzer-vscode/issues"
    }
};
