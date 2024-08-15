/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import * as fspromises from 'fs/promises';
import { CoreExtensionService, Connection, TelemetryService } from '../lib/core-extension-service';
import * as Constants from '../lib/constants';
import {messages} from '../lib/messages';
import { RuleResult, ApexGuruViolation } from '../types';
import { DiagnosticManager } from '../lib/diagnostics';
import { RunInfo } from '../extension';

export async function isApexGuruEnabledInOrg(outputChannel: vscode.LogOutputChannel): Promise<boolean> {
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
		outputChannel.error('***ApexGuru perm check failed with error:***' + errMsg);
		outputChannel.show();
		return false;
	}
}

export async function runApexGuruOnFile(selection: vscode.Uri, runInfo: RunInfo) {
	const {
		diagnosticCollection,
		commandName,
		outputChannel
	} = runInfo;
	const startTime = Date.now();
	try {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification
		}, async (progress) => {
			progress.report(messages.apexGuru.progress);
			const connection = await CoreExtensionService.getConnection();
			const requestId = await initiateApexGuruRequest(selection, outputChannel, connection);
			outputChannel.appendLine('***Apex Guru request Id:***' + requestId);

			const queryResponse: ApexGuruQueryResponse = await pollAndGetApexGuruResponse(connection, requestId, Constants.APEX_GURU_MAX_TIMEOUT_SECONDS, Constants.APEX_GURU_RETRY_INTERVAL_MILLIS);

			const decodedReport = Buffer.from(queryResponse.report, 'base64').toString('utf8');
			outputChannel.appendLine('***Retrieved analysis report from ApexGuru***:' + decodedReport);

			const ruleResult = transformStringToRuleResult(selection.fsPath, decodedReport);
			new DiagnosticManager().displayDiagnostics([selection.fsPath], [ruleResult], diagnosticCollection);
			TelemetryService.sendCommandEvent(Constants.TELEM_SUCCESSFUL_APEX_GURU_FILE_ANALYSIS, {
				executedCommand: commandName,
				duration: (Date.now() - startTime).toString()
			});
			void vscode.window.showInformationMessage(messages.apexGuru.finishedScan(ruleResult.violations.length));
		});
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : e as string;
        outputChannel.appendLine('***Apex Guru initiate request failed***');
        outputChannel.appendLine(errMsg);
    }
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

export async function initiateApexGuruRequest(selection: vscode.Uri, outputChannel: vscode.LogOutputChannel, connection: Connection): Promise<string> {
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
		outputChannel.warn('***Apex Guru returned unexpected response:***' + response.status);
		throw Error('***Apex Guru returned unexpected response:***' + response.status);
	}

	const requestId = response.requestId;
	return requestId;
}

export const fileSystem = {
	readFile: (path: string) => fspromises.readFile(path, 'utf8')
};

export function transformStringToRuleResult(fileName: string, jsonString: string): RuleResult {
    const reports = JSON.parse(jsonString) as ApexGuruReport[];

    const ruleResult: RuleResult = {
        engine: 'apexguru',
        fileName: fileName,
        violations: []
    };

	reports.forEach(parsed => {
		const encodedClassAfter = parsed.properties.find((prop: ApexGuruProperty) => prop.name === 'code_after')?.value;

		const violation: ApexGuruViolation = {
			ruleName: parsed.type,
			message: parsed.value,
			severity: 1,
			category: parsed.type, // Replace with actual category if available
			line: parseInt(parsed.properties.find((prop: ApexGuruProperty) => prop.name === 'line_number')?.value),
			column: 1,
			suggestedCode: Buffer.from(encodedClassAfter, 'base64').toString('utf8')
		};
	
		ruleResult.violations.push(violation);
	});

	return ruleResult;
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
