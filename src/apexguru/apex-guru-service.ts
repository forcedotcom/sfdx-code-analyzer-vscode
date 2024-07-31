/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import * as fspromises from 'fs/promises';
import { CoreExtensionService } from '../lib/core-extension-service';
import { ApexGuruAuthResponse, ApexGuruInitialResponse } from '../types';
import * as Constants from '../lib/constants';

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

export async function runApexGuruOnFile(selection: vscode.Uri, outputChannel: vscode.LogOutputChannel) {
	try {
        const requestId = await initiateApexGuruRequest(selection, outputChannel);
        outputChannel.appendLine('***Apex Guru request Id:***' + requestId);
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : e as string;
        outputChannel.appendLine('***Apex Guru initiate request failed***');
        outputChannel.appendLine(errMsg);
    }
}

export async function initiateApexGuruRequest(selection: vscode.Uri, outputChannel: vscode.LogOutputChannel) {
	const fileContent = await fileSystem.readFile(selection.fsPath);
	const base64EncodedContent = Buffer.from(fileContent).toString('base64');
	const connection = await CoreExtensionService.getConnection();
	const response: ApexGuruInitialResponse = await connection.request({
		method: 'POST',
		url: Constants.APEX_GURU_REQUEST,
		body: JSON.stringify({
			classContent: base64EncodedContent
		})
	});

	if (response.status != 'new' && response.status != 'success') {
		outputChannel.warn('***Apex Guru returned unexpected response:***' + response.status);
		return '';
	}

	const requestId = response.requestId;
	return requestId;
}

export const fileSystem = {
	readFile: (path: string) => fspromises.readFile(path, 'utf8')
};

