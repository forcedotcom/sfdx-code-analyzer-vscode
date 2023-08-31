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
    info: {
        finishedScan: (scannedCount: number, badFileCount: number, violationCount: number) => `Scan complete. Analyzed ${scannedCount} files. ${violationCount} violations found in ${badFileCount} files.`
    },
    graphEngine: {
        noViolationsFound: "Scan was completed. No violations found.",
        resultsTab: "Graph Engine Results",
        spinnerText: '$(loading~spin) Running Graph Engine analysis...',
        statusBarName: "Graph Engine Analysis"
    },
    fixer: {
        supressOnLine: "Suppress violations on this line."
    },
    diagnostics: {
        messageGenerator: (severity: number, message: string) => `Sev${severity}: ${message}`,
        source: {
            generator: (engine: string) => `${engine} via Code Analyzer`,
            isSource: (source: string) => source.endsWith(' via Code Analyzer'),
            extractEngine: (source: string) => source.split(' ')[0]
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
        sfdxScannerMissing: "To use this extension, first install `@salesforce/sfdx-scanner`."
    }
};