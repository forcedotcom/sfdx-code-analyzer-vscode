/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as Constants from '../constants';
import {CodeLocation, Violation} from '../diagnostics';
import {Logger} from "../logger";
import {getErrorMessage, indent} from '../utils';
import {HttpMethods, HttpRequest, OrgCommunicationService} from '../external-services/org-communication-service';
import {FileHandler} from '../fs-utils';

export const APEX_GURU_ENGINE_NAME: string = 'apexguru';

const RESPONSE_STATUS = {
    NEW: "new",
    SUCCESS: "success",
    FAILED: "failed",
    ERROR: "error"
}

export interface ApexGuruService {
    isApexGuruAvailable(): Promise<boolean>;
    scan(absFileToScan: string): Promise<Violation[]>;
}

export class LiveApexGuruService implements ApexGuruService {
    private readonly orgCommunicationService: OrgCommunicationService;
    private readonly fileHandler: FileHandler;
    private readonly logger: Logger;
    private readonly maxTimeoutSeconds: number;
    private readonly retryIntervalMillis: number;
    constructor(
                orgCommunicationService: OrgCommunicationService,
                fileHandler: FileHandler,
                logger: Logger,
                maxTimeoutSeconds: number = Constants.APEX_GURU_MAX_TIMEOUT_SECONDS,
                retryIntervalMillis: number = Constants.APEX_GURU_RETRY_INTERVAL_MILLIS) {
        this.orgCommunicationService = orgCommunicationService;
        this.fileHandler = fileHandler;
        this.logger = logger;
        this.maxTimeoutSeconds = maxTimeoutSeconds;
        this.retryIntervalMillis = retryIntervalMillis;
    }

    async isApexGuruAvailable(): Promise<boolean> {
        if (!this.orgCommunicationService.isAuthed()) {
            return false;
        }
        const response: ApexGuruResponse = await this.request('GET', Constants.APEX_GURU_VALIDATE_ENDPOINT);
        return response.status === RESPONSE_STATUS.SUCCESS;
    }

    async scan(absFileToScan: string): Promise<Violation[]> {
        const fileContent: string = await this.fileHandler.readFile(absFileToScan);
        const requestId = await this.initiateRequest(fileContent);
        this.logger.debug(`Initialized ApexGuru Analysis with Request Id: ${requestId}`);
        const queryResponse: ApexGuruQueryResponse = await this.waitForResponse(requestId);
        this.logger.debug(`ApexGuru Analysis completed for Request Id: ${requestId}`);
        const reports: ApexGuruReport[] = toReportArray(queryResponse);
        return reports.map(r => toViolation(r, absFileToScan));
    }

    private async initiateRequest(fileContent: string): Promise<string> {
        const base64EncodedContent = Buffer.from(fileContent).toString('base64');
        const response: ApexGuruInitialResponse = await this.request('POST', Constants.APEX_GURU_REQUEST_ENDPOINT,
            JSON.stringify({classContent: base64EncodedContent}));
        if (!response.requestId || response.status != RESPONSE_STATUS.NEW) {
            throw Error(`ApexGuru returned an unexpected response:\n${JSON.stringify(response, null, 2)}`);
        }
        return response.requestId;
    }

    private async waitForResponse(requestId: string): Promise<ApexGuruQueryResponse> {
        const startTime = Date.now();
        let queryResponse: ApexGuruQueryResponse = undefined;
        while ((Date.now() - startTime) < this.maxTimeoutSeconds * 1000) {
            if (queryResponse) { // After the first attempt, we pause each time between requests
                await new Promise(resolve => setTimeout(resolve, this.retryIntervalMillis));
            }
            queryResponse = await this.request('GET', `${Constants.APEX_GURU_REQUEST_ENDPOINT}/${requestId}`);
            if (queryResponse.status === RESPONSE_STATUS.SUCCESS && queryResponse.report) {
                return queryResponse;
            } else if (queryResponse.status === RESPONSE_STATUS.FAILED) { // TODO: I would love a failure message - but the response's report just gives back the file content and nothing else.
                throw new Error(`ApexGuru was unable to analyze the file.`);
            } else if (queryResponse.status === RESPONSE_STATUS.ERROR && queryResponse.message) {
                throw new Error(`ApexGuru returned an unexpected error: ${queryResponse.message}`);
            }
        }
        throw new Error(`Failed to get a successful response from ApexGuru after ${this.maxTimeoutSeconds} seconds.\n` + 
            `Last response:\n${JSON.stringify(queryResponse, null, 2)}`);
    }

    private async request<T extends ApexGuruResponse>(method: HttpMethods, endpointUrl: string, body?: string): Promise<T>  {
        const requestObj: HttpRequest = {
            method: method,
            url: endpointUrl,
            body: body
        };

        try {
            this.logger.trace(`Sending request to ApexGuru:\n${JSON.stringify(requestObj, null, 2)}`);
            const responseObj: T = await this.orgCommunicationService.request(requestObj);
            this.logger.trace(`Received response from ApexGuru:\n${JSON.stringify(responseObj, null, 2)}`);
            if (typeof(responseObj.status) !== "string") {
                throw new Error("Expected response to contain 'status' field with a string value. Instead received:\n" + 
                    JSON.stringify(responseObj, null, 2));
            }
            // This helps things map to the RESPONSE_STATUS constants with case insensitivity
            responseObj.status = responseObj.status.toLowerCase();
            
            return responseObj;
        } catch (err) {
            this.logger.trace('Call to ApexGuru Service failed:' + getErrorMessage(err));
            return {
                status: RESPONSE_STATUS.ERROR,
                message: getErrorMessage(err)
            } as T;
        }
    }
}


export function toReportArray(response: ApexGuruQueryResponse): ApexGuruReport[] {
    // TODO: This will change soon enough - once we receive the actual response
    const report: string = Buffer.from(response.report, 'base64').toString('utf-8');
    try {
        return JSON.parse(report) as ApexGuruReport[];
    } catch (err) {
        throw new Error(`Unable to parse response from ApexGuru.\n\n` + 
            `Error:\n${indent(getErrorMessage(err))}\n\nDecoded report:\n${indent(report)}`);
    }
}

function toViolation(parsed: ApexGuruReport, file: string): Violation {
    // IMPORTANT: AS OF 08/13/2024 THIS ALL FAILS IN PRODUCTION BECAUSE THE NEW ApexGuru Service NOW HAS A NEW
    //            RESPONSE. TODO: W-19053527
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
        engine: APEX_GURU_ENGINE_NAME,
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
                message: suggestedCode
            }
        ]
    }
    return violation;
}


type ApexGuruResponse = {
    status: string;
    message?: string;
}

type ApexGuruInitialResponse = ApexGuruResponse & {
    requestId: string;
}

type ApexGuruQueryResponse = ApexGuruResponse & {
    report: string;
}

type ApexGuruProperty = {
    name: string;
    value: string;
};

type ApexGuruReport = {
    id: string;
    type: string;
    value: string;
    properties: ApexGuruProperty[];
}
