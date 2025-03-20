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
    agentforce: {
        a4dQuickFixUnavailable: "The ability to fix violations with Agentforce is unavailable since a compatible 'Agentforce for Developers' extension was not found or activated. To enable this functionality, please install the 'Agentforce for Developers' extension and restart VS Code.",
        fixViolationWithA4D: (ruleName: string) => `Fix '${ruleName}' using Agentforce. (Beta)`,
        failedA4DResponse: "Unable to receive code fix suggestion from Agentforce.",
        explanationOfFix: (explanation: string) => `Agentforce Fix Explanation: ${explanation}`
    },
    apexGuru: {
        progress: {
            message: "Code Analyzer is running ApexGuru analysis."
        },
        finishedScan: (violationCount: number) => `Scan complete. ${violationCount} violations found.`
    },
    info: {
        scanningWith: (scannerName: string) => `Scanning with ${scannerName}`,
        finishedScan: (scannedCount: number, badFileCount: number, violationCount: number) => `Scan complete. Analyzed ${scannedCount} files. ${violationCount} violations found in ${badFileCount} files.`
    },
    graphEngine: {
        noViolationsFound: "Scan was completed. No violations found.",
        noViolationsFoundForPartialRuns: "Partial Salesforce Graph Engine scan of the changed code completed, and no violations found.  IMPORTANT: You might still have violations in the code that you haven't changed since the previous full scan.",
        resultsTab: "Graph Engine Results",
        spinnerText: 'Running Graph Engine analysis...',
        statusBarName: "Graph Engine Analysis",
        noDfaRun: "We didn't find a running Salesforce Graph Engine analysis, so nothing was canceled.",
        dfaRunStopped: "Salesforce Graph Engine analysis canceled.",
        existingDfaRunText: "A Salesforce Graph Engine analysis is already running. Cancel it by clicking in the Status Bar.",
    },
    fixer: {
        suppressPMDViolationsOnLine: "Suppress all PMD violations on this line.",
        suppressPmdViolationsOnClass: (ruleName?: string) => ruleName ? `Suppress '${ruleName}' on this class.` : `Suppress all PMD violations on this class.`,
        fixWithApexGuruSuggestions: "Insert ApexGuru suggestions."
    },
    diagnostics: {
        messageGenerator: (severity: number, message: string) => `Sev${severity}: ${message}`,
        source: {
            suffix: 'via Code Analyzer',
            generator: (engine: string) => `${engine} ${messages.diagnostics.source.suffix}`
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
        codeAnalyzerMissing: "To use this extension, first install the `code-analyzer` Salesforce CLI plugin by running `sf plugins install code-analyzer` in the VS Code integrated terminal.",
        coreExtensionServiceUninitialized: "CoreExtensionService.ts didn't initialize. Log a new issue on Salesforce Code Analyzer VS Code extension repo: https://github.com/forcedotcom/sfdx-code-analyzer-vscode/issues"
    }
};
