/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import * as fspromises from 'fs/promises';
import {Connection, CoreExtensionService} from '../lib/core-extension-service';
import * as Constants from '../lib/constants';
import {messages} from '../lib/messages';
import {DiagnosticConvertible, DiagnosticManagerImpl} from '../lib/diagnostics';
import {RunInfo} from '../extension';
import {TelemetryService} from "../lib/external-services/telemetry-service";
import {Logger} from "../lib/logger";

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
        logger.error('Apex Guru perm check failed with error:' + errMsg);
        return false;
    }
}

export async function runApexGuruOnFile(selection: vscode.Uri, runInfo: RunInfo, telemetryService: TelemetryService, logger: Logger) {
    const {
        diagnosticCollection,
        commandName
    } = runInfo;
    const startTime = Date.now();
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification
        }, async (progress) => {
            progress.report(messages.apexGuru.progress);
            const connection = await CoreExtensionService.getConnection();
            const requestId = await initiateApexGuruRequest(selection, logger, connection);
            logger.log('Code Analyzer with ApexGuru request Id:' + requestId);

            const queryResponse: ApexGuruQueryResponse = await pollAndGetApexGuruResponse(connection, requestId, Constants.APEX_GURU_MAX_TIMEOUT_SECONDS, Constants.APEX_GURU_RETRY_INTERVAL_MILLIS);

            const decodedReport = Buffer.from(queryResponse.report, 'base64').toString('utf8');

            const convertibles: DiagnosticConvertible[] = transformStringToDiagnosticConvertibles(selection.fsPath, decodedReport);
            // TODO: For testability, the diagnostic manager should probably be passed in, not instantiated here.
            new DiagnosticManagerImpl(diagnosticCollection).displayAsDiagnostics([selection.fsPath], convertibles);
            telemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_APEX_GURU_FILE_ANALYSIS, {
                executedCommand: commandName,
                duration: (Date.now() - startTime).toString(),
                violationCount: convertibles.length.toString(),
                violationsWithSuggestedCodeCount: getConvertiblesWithSuggestions(convertibles).toString()
            });
            void vscode.window.showInformationMessage(messages.apexGuru.finishedScan(convertibles.length));
        });
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : e as string;
        logger.error('Initial Code Analyzer with ApexGuru request failed: ' + errMsg);
    }
}

export function getConvertiblesWithSuggestions(convertibles: DiagnosticConvertible[]): number {
    // Filter convertibles that have a non-empty suggestedCode and get count
    return convertibles.filter(convertible => convertible.suggestedCode !== '').length;
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

export function transformStringToDiagnosticConvertibles(fileName: string, jsonString: string): DiagnosticConvertible[] {
    const reports: ApexGuruReport[] = JSON.parse(jsonString) as ApexGuruReport[];

    const convertibles: DiagnosticConvertible[] = [];

    reports.forEach(parsed => {
        const encodedCodeBefore = parsed.properties.find((prop: ApexGuruProperty) => prop.name === 'code_before')?.value
            ?? parsed.properties.find((prop: ApexGuruProperty) => prop.name === 'class_before')?.value
            ?? '';
        const encodedCodeAfter = parsed.properties.find((prop: ApexGuruProperty) => prop.name === 'code_after')?.value
            ?? parsed.properties.find((prop: ApexGuruProperty) => prop.name === 'class_after')?.value
            ?? '';
        const lineNumber = parseInt(parsed.properties.find((prop: ApexGuruProperty) => prop.name === 'line_number')?.value);

        convertibles.push({
            rule: parsed.type,
            engine: 'apexguru',
            message: parsed.value,
            severity: 1,
            locations: [{
                file: fileName,
                startLine: lineNumber,
                startColumn: 1
            }],
            primaryLocationIndex: 0,
            resources: [
                'https://help.salesforce.com/s/articleView?id=sf.apexguru_antipatterns.htm&type=5'
            ],
            currentCode: Buffer.from(encodedCodeBefore, 'base64').toString('utf8'),
            suggestedCode: Buffer.from(encodedCodeAfter, 'base64').toString('utf8')
        });
    });
    return convertibles;
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
