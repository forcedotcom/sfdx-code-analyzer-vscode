/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
export const messages = {
    noActiveEditor: "Unable to perform action: No active editor.",
    staleDiagnosticPrefix: "(STALE: The code has changed. Re-run the scan.)",
    scanProgressReport: {
        verifyingCodeAnalyzerIsInstalled: "Verifying Code Analyzer CLI plugin is installed.",
        identifyingTargets: "Code Analyzer is identifying targets.",
        analyzingTargets: "Code Analyzer is analyzing targets.",
        processingResults: "Code Analyzer is processing results." // Shared with ApexGuru and CodeAnalyzer
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
        runningAnalysis: "Code Analyzer is running ApexGuru analysis.",
        finishedScan: (violationCount: number) => `Scan complete. ${violationCount} violations found.`,
        warnings: {
            canOnlyScanOneFile: (file: string) => 
                `ApexGuru can scan only one file at a time. Ignoring the other files in your multi-selection and scanning only this file: ${file}.`
        },
        errors: {
            unableToAnalyzeFile: (reason: string) => `ApexGuru was unable to analyze the file. ${reason}`,
            returnedUnexpectedResponse: (responseStr: string) => 
                `ApexGuru returned an unexpected response:\n${responseStr}`,
            returnedUnexpectedError: (errMsg: string) => `ApexGuru returned an unexpected error: ${errMsg}`,
            failedToGetResponseBeforeTimeout: (maxSeconds: number, lastResponse: string) => 
                `Failed to get a successful response from ApexGuru after ${maxSeconds} seconds.\n` + 
                `Last response:\n${lastResponse}`,
            expectedResponseToContainStatusField: (responseStr: string) => 
                `ApexGuru returned a response without a 'status' field containing a string value. Instead received:\n${responseStr}`,
            unableToParsePayload: (errMsg: string) =>
                `Unable to parse the payload from the response from ApexGuru. Error:\n${errMsg}`
        }
    },
    info: {
        scanningWith: (version: string) => `Scanning with code-analyzer@${version} via CLI`,
        finishedScan: (scannedCount: number, badFileCount: number, violationCount: number) => `Scan complete. Analyzed ${scannedCount} files. ${violationCount} violations found in ${badFileCount} files.`
    },
    suggestions: {
        suggestionFor: "Suggestion for",
        suggestionCopiedToClipboard: (engineName: string, ruleName: string) =>  `Suggestion for '${engineName}.${ruleName}' copied to clipboard.`
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
        error: {
            nonexistentSelectedFileGenerator: (file: string) => `Selected file doesn't exist: ${file}`,
            noFileSelected: "Select a file to scan"
        }
    },
    codeAnalyzer: {
        codeAnalyzerMissing: "To use this extension, first install the `code-analyzer` Salesforce CLI plugin.",
        doesNotMeetMinVersion: (currentVer: string, recommendedVer: string) => `The currently installed version '${currentVer}' of the \`code-analyzer\` Salesforce CLI plugin is unsupported by this extension. Please use version '${recommendedVer}' or greater.`,
        usingOlderVersion: (currentVer: string, recommendedVer: string) => `The currently installed version '${currentVer}' of the \`code-analyzer\` Salesforce CLI plugin is only partially supported by this extension. To take advantage of the latest features of this extension, we recommended using version '${recommendedVer}' or greater.`,
        installLatestVersion: 'Install the latest `code-analyzer` Salesforce CLI plugin by running `sf plugins install code-analyzer` in the VS Code integrated terminal.',
    },
    error: {
        analysisFailedGenerator: (reason: string) => `Analysis failed: ${reason}`,  // Shared with ApexGuru and CodeAnalyzer
        engineUninstantiable: (engine: string) => `Error: Couldn't initialize engine "${engine}" due to a setup error. Analysis continued without this engine. Click "Show error" to see the error message. Click "Ignore error" to ignore the error for this session. Click "Learn more" to view the system requirements for this engine, and general instructions on how to set up Code Analyzer.`,
        pmdConfigNotFoundGenerator: (file: string) => `PMD custom config file couldn't be located. [${file}]. Check Salesforce Code Analyzer > PMD > Custom Config settings`,
        sfMissing: "To use the Salesforce Code Analyzer extension, first install Salesforce CLI.",
        coreExtensionServiceUninitialized: "CoreExtensionService.ts didn't initialize. Log a new issue on Salesforce Code Analyzer VS Code extension repo: https://github.com/forcedotcom/sfdx-code-analyzer-vscode/issues"
    },
    buttons: {
        learnMore: 'Learn more',
        showError: 'Show error',
        ignoreError: 'Ignore error',
        showSettings: 'Show settings'
    }
};
