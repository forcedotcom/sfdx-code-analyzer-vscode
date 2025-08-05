/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
export const messages = {
    noActiveEditor: "Unable to perform action: No active editor.",
    staleDiagnosticPrefix: "(STALE: The code has changed. Re-run the scan.)",
    stoppingV4SupportSoon: "We no longer support Code Analyzer v4 and will soon remove it from this VS Code extension. We highly recommend that you start using v5 by unselecting the 'Code Analyzer: Use v4 (Deprecated)' setting. For information on v5, see https://developer.salesforce.com/docs/platform/salesforce-code-analyzer/guide/code-analyzer.html.",
    scanProgressReport: {
        verifyingCodeAnalyzerIsInstalled: "Verifying Code Analyzer CLI plugin is installed.",
        identifyingTargets: "Code Analyzer is identifying targets.",
        analyzingTargets: "Code Analyzer is analyzing targets.",
        processingResults: "Code Analyzer is processing results."
    },
    agentforce: {
        a4dQuickFixUnavailable: "The ability to fix violations with 'Agentforce for Developers' is unavailable since a compatible 'Agentforce for Developers' extension was not found or activated. To enable this functionality, please install the 'Agentforce for Developers' extension and restart VS Code.",
        failedA4DResponse: "Unable to receive code fix suggestion from Agentforce for Developers."
    },
    unifiedDiff: {
        mustAcceptOrRejectDiffFirst: "You must accept or reject all changes before performing this action.",
        editorCodeLensMustBeEnabled: "This action requires the 'Editor: Code Lens' setting to be enabled."
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
        suppressPMDViolationsOnLine: "Suppress all 'pmd' violations on this line",
        suppressPmdViolationsOnClass: (ruleName: string) => `Suppress 'pmd.${ruleName}' on this class`,
        applyFix: (engineName: string, ruleName: string) => `Fix '${engineName}.${ruleName}' using Code Analyzer`,
        noFixSuggested: "No fix was suggested.",
        explanationOfFix: (explanation: string) => `Fix Explanation: ${explanation}`
    },
    diagnostics: {
        messageGenerator: (severity: number, message: string) => `Sev${severity}: ${message}`,
        source: {
            suffix: 'via Code Analyzer'
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
    codeAnalyzer: {
        codeAnalyzerMissing: "To use this extension, first install the `code-analyzer` Salesforce CLI plugin.",
        doesNotMeetMinVersion: (currentVer: string, recommendedVer: string) => `The currently installed version '${currentVer}' of the \`code-analyzer\` Salesforce CLI plugin is unsupported by this extension. Please use version '${recommendedVer}' or greater.`,
        usingOlderVersion: (currentVer: string, recommendedVer: string) => `The currently installed version '${currentVer}' of the \`code-analyzer\` Salesforce CLI plugin is only partially supported by this extension. To take advantage of the latest features of this extension, we recommended using version '${recommendedVer}' or greater.`,
        installLatestVersion: 'Install the latest `code-analyzer` Salesforce CLI plugin by running `sf plugins install code-analyzer` in the VS Code integrated terminal.',
    },
    error: {
        analysisFailedGenerator: (reason: string) => `Analysis failed: ${reason}`,
        engineUninstantiable: (engine: string) => `Error: Couldn't initialize engine "${engine}" due to a setup error. Analysis continued without this engine. Click "Show error" to see the error message. Click "Ignore error" to ignore the error for this session. Click "Learn more" to view the system requirements for this engine, and general instructions on how to set up Code Analyzer.`,
        pmdConfigNotFoundGenerator: (file: string) => `PMD custom config file couldn't be located. [${file}]. Check Salesforce Code Analyzer > PMD > Custom Config settings`,
        sfMissing: "To use the Salesforce Code Analyzer extension, first install Salesforce CLI.",
        sfdxScannerMissing: "To use the 'Code Analyzer: Use v4 (Deprecated)' setting, you must first install the `@salesforce/sfdx-scanner` Salesforce CLI plugin. But we no longer support v4, so we recommend that you use v5 instead and unselect the 'Code Analyzer: Use v4 (Deprecated)' setting.",
        coreExtensionServiceUninitialized: "CoreExtensionService.ts didn't initialize. Log a new issue on Salesforce Code Analyzer VS Code extension repo: https://github.com/forcedotcom/sfdx-code-analyzer-vscode/issues"
    },
    buttons: {
        learnMore: 'Learn more',
        showError: 'Show error',
        ignoreError: 'Ignore error',
        showSettings: 'Show settings',
        startUsingV5: 'Start using v5'
    }
};
