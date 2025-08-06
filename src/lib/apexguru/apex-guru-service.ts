/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import * as fspromises from 'fs/promises';
import {Connection, CoreExtensionService} from '../core-extension-service';
import * as Constants from '../constants';
import {messages} from '../messages';
import {CodeAnalyzerDiagnostic, CodeLocation, DiagnosticManager, toRange, Violation} from '../diagnostics';
import {TelemetryService} from "../external-services/telemetry-service";
import {Logger} from "../logger";
import { indent } from '../utils';

export async function isApexGuruEnabledInOrg(logger: Logger): Promise<boolean> {
    try {
        const connection = await CoreExtensionService.getConnection();
        const response:ApexGuruAuthResponse = await connection.request({
            method: 'GET',
            url: Constants.APEX_GURU_AUTH_ENDPOINT,
            body: ''
        });
        return response.status == 'Success';
    } catch(e) {
        // This could throw an error for a variety of reasons. The API endpoint has not been deployed to the instance, org has no perms, timeouts etc,.
        // In all of these scenarios, we return false.
        const errMsg = e instanceof Error ? e.message : e as string;
        logger.warn('Apex Guru perm check failed with error:' + errMsg);
        return false;
    }
}

export async function runApexGuruOnFile(uri: vscode.Uri, commandName: string, diagnosticManager: DiagnosticManager, telemetryService: TelemetryService, logger: Logger) {
    const startTime = Date.now();
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification
        }, async (progress) => {
            progress.report(messages.apexGuru.progress);
            const connection = await CoreExtensionService.getConnection();
            const requestId = await initiateApexGuruRequest(uri, logger, connection);
            logger.log('Code Analyzer with ApexGuru request Id:' + requestId);

            const queryResponse: ApexGuruQueryResponse = await pollAndGetApexGuruResponse(connection, requestId, Constants.APEX_GURU_MAX_TIMEOUT_SECONDS, Constants.APEX_GURU_RETRY_INTERVAL_MILLIS);

            const decodedReport = Buffer.from(queryResponse.report, 'base64').toString('utf8');

            const diagnostics: CodeAnalyzerDiagnostic[] = transformReportJsonStringToDiagnostics(uri.fsPath, decodedReport);
            diagnosticManager.addDiagnostics(diagnostics);

            telemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_APEX_GURU_FILE_ANALYSIS, {
                executedCommand: commandName,
                duration: (Date.now() - startTime).toString(),
                violationCount: diagnostics.length.toString(),
                violationsWithSuggestedCodeCount: getDiagnosticsWithSuggestions(diagnostics).length.toString()
            });
            void vscode.window.showInformationMessage(messages.apexGuru.finishedScan(diagnostics.length));
        });
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : e as string;
        logger.error('Failed to Scan for Performance Issues with ApexGuru: ' + errMsg);
    }
}

function getDiagnosticsWithSuggestions(diagnostics: CodeAnalyzerDiagnostic[]): CodeAnalyzerDiagnostic[] {
    // If the diagnostic has relatedInformation, then it must have suggestions.
    return diagnostics.filter(d => d.relatedInformation && d.relatedInformation.length > 0)
}

export async function pollAndGetApexGuruResponse(connection: Connection, requestId: string, maxWaitTimeInSeconds: number, retryIntervalInMillis: number): Promise<ApexGuruQueryResponse> {
    let queryResponse: ApexGuruQueryResponse;
    let lastErrorMessage = '';
    const startTime = Date.now();
    while ((Date.now() - startTime) < maxWaitTimeInSeconds * 1000) {
        try {
            queryResponse = await connection.request({
                method: 'GET',
                url: `${Constants.APEX_GURU_REQUEST}/${requestId}`,
                body: ''
            });
            if (queryResponse.status == 'success') {
                return queryResponse;
            }
        } catch (error) {
            lastErrorMessage = (error as Error).message;
        }
        await new Promise(resolve => setTimeout(resolve, retryIntervalInMillis));

    }
    if (queryResponse) {
        return queryResponse;
    }
    throw new Error(`Failed to get a successful response from Apex Guru after maximum retries.${lastErrorMessage}`);
}

export async function initiateApexGuruRequest(selection: vscode.Uri, logger: Logger, connection: Connection): Promise<string> {
    const fileContent = await fileSystem.readFile(selection.fsPath);
    const base64EncodedContent = Buffer.from(fileContent).toString('base64');
    const response: ApexGuruInitialResponse = await connection.request({
        method: 'POST',
        url: Constants.APEX_GURU_REQUEST,
        body: JSON.stringify({
            classContent: base64EncodedContent
        })
    });

    if (response.status != 'new' && response.status != 'success') {
        logger.warn('Code Analyzer with Apex Guru returned unexpected response:' + response.status);
        throw Error('Code Analyzer with Apex Guru returned unexpected response:' + response.status);
    }

    return response.requestId;
}

export const fileSystem = {
    readFile: (path: string) => fspromises.readFile(path, 'utf8')
};

export function transformReportJsonStringToDiagnostics(fileName: string, jsonString: string): CodeAnalyzerDiagnostic[] {
    try {
        const reports: ApexGuruReport[] = JSON.parse(jsonString) as ApexGuruReport[];
        return reports.map(report => reportToDiagnostic(fileName, report));
    } catch (err) {
        const errMsg: string = err instanceof Error ? err.stack : err as string;
        throw new Error(`Unable to parse response from ApexGuru: ${errMsg}`);
    }
}

function reportToDiagnostic(file: string, parsed: ApexGuruReport): CodeAnalyzerDiagnostic {
    // TODO: We have no need for "currentCode" right now. Temporarily leaving this code here until we get the new payload updates.
    // const encodedCodeBefore = parsed.properties.find((prop: ApexGuruProperty) => prop.name === 'code_before')?.value
    //     ?? parsed.properties.find((prop: ApexGuruProperty) => prop.name === 'class_before')?.value
    //     ?? '';
    // const currentCode: string = Buffer.from(encodedCodeBefore, 'base64').toString('utf8');

    const encodedCodeAfter = parsed.properties.find((prop: ApexGuruProperty) => prop.name === 'code_after')?.value
        ?? parsed.properties.find((prop: ApexGuruProperty) => prop.name === 'class_after')?.value
        ?? '';
    const suggestedCode: string = Buffer.from(encodedCodeAfter, 'base64').toString('utf8');

    const lineNumber = parseInt(parsed.properties.find((prop: ApexGuruProperty) => prop.name === 'line_number')?.value);

    const violationLocation: CodeLocation = {
        file: file,
        startLine: lineNumber,
        startColumn: 1
    };

    const violation: Violation = {
        rule: parsed.type,
        engine: 'apexguru',
        message: parsed.value,
        severity: 1, // TODO: Should this really be critical level violation? This seems off.
        locations: [violationLocation],
        primaryLocationIndex: 0,
        tags: [],
        resources: [
            'https://help.salesforce.com/s/articleView?id=sf.apexguru_antipatterns.htm&type=5'
        ]
    };

    // TODO: Soon we'll be receiving a different looking payload which will help us differentiate between fixes and suggestions.
    //       For now, we are going to treat suggestedCode as a fix and a suggestion (as the current pilot code does)
    if (suggestedCode.length > 0) {
        violation.fixes = [
            {
                location: violationLocation,
                fixedCode: `/*\n//ApexGuru Suggestions: \n${suggestedCode}\n*/`
            }
        ]
        violation.suggestions = [
            {
                location: violationLocation,
                // This message is temporary and will be improved as we get a better response back and unify the suggestions experience
                message: `ApexGuru Suggestion:\n${indent(suggestedCode)}\n`
            }
        ]
    }

    const diagnostic: CodeAnalyzerDiagnostic = CodeAnalyzerDiagnostic.fromViolation(violation);


    // TODO: This is temporary until we address the unification of suggestions (which will have a better way of showing suggestions on the vscode editor window)
    if (violation.suggestions?.length > 0) {
        diagnostic.relatedInformation = [
            new vscode.DiagnosticRelatedInformation(
                new vscode.Location(
                    vscode.Uri.parse(violation.suggestions[0].location.file), // When we have a better way of displaying these, we'll need a loop instead of assuming just 1 suggestion
                    toRange(violation.suggestions[0].location)),
                violation.suggestions[0].message
            )
        ];
    }

    return diagnostic;
}

export type ApexGuruAuthResponse = {
    status: string;
}

export type ApexGuruInitialResponse = {
    status: string;
    requestId: string;
    message: string;
}

export type ApexGuruQueryResponse = {
    status: string;
    message?: string;
    report?: string;
}

export type ApexGuruProperty = {
    name: string;
    value: string;
};

export type ApexGuruReport = {
    id: string;
    type: string;
    value: string;
    properties: ApexGuruProperty[];
}
