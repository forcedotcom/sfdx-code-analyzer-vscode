/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {CodeLocation, Fix, Suggestion, Violation} from '../diagnostics';
import {Logger} from "../logger";
import {getErrorMessage, indent} from '../utils';
import {HttpMethods, HttpRequest, OrgConnectionService} from '../external-services/org-connection-service';
import {FileHandler} from '../fs-utils';
import { messages } from '../messages';

export const APEX_GURU_ENGINE_NAME: string = 'apexguru';
const APEX_GURU_MAX_TIMEOUT_SECONDS = 60;
const APEX_GURU_RETRY_INTERVAL_MILLIS = 1000;

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
    private readonly orgConnectionService: OrgConnectionService;
    private readonly fileHandler: FileHandler;
    private readonly logger: Logger;
    private readonly maxTimeoutSeconds: number;
    private readonly retryIntervalMillis: number;
    constructor(
                orgConnectionService: OrgConnectionService,
                fileHandler: FileHandler,
                logger: Logger,
                maxTimeoutSeconds: number = APEX_GURU_MAX_TIMEOUT_SECONDS,
                retryIntervalMillis: number = APEX_GURU_RETRY_INTERVAL_MILLIS) {
        this.orgConnectionService = orgConnectionService;
        this.fileHandler = fileHandler;
        this.logger = logger;
        this.maxTimeoutSeconds = maxTimeoutSeconds;
        this.retryIntervalMillis = retryIntervalMillis;
    }

    async isApexGuruAvailable(): Promise<boolean> {
        if (!this.orgConnectionService.isAuthed()) {
            return false;
        }
        const response: ApexGuruResponse = await this.request('GET', await this.getValidateEndpoint());
        return response.status === RESPONSE_STATUS.SUCCESS;
    }

    async scan(absFileToScan: string): Promise<Violation[]> {
        const fileContent: string = await this.fileHandler.readFile(absFileToScan);
        const requestId = await this.initiateRequest(fileContent);
        this.logger.debug(`Initialized ApexGuru Analysis with Request Id: ${requestId}`);
        const queryResponse: ApexGuruQueryResponse = await this.waitForResponse(requestId);
        const payloadStr: string = decodeFromBase64(queryResponse.report);
        this.logger.debug(`ApexGuru Analysis completed for Request Id: ${requestId}\n\nDecoded Response Payload:\n${payloadStr}`);
        const apexGuruViolations: ApexGuruViolation[] = parsePayload(payloadStr);
        return apexGuruViolations.map(v => toViolation(v, absFileToScan));
    }

    private async initiateRequest(fileContent: string): Promise<string> {
        const requestBody: ApexGuruRequestBody = {
            classContent: encodeToBase64(fileContent)
        };
        const response: ApexGuruInitialResponse = await this.request('POST', await this.getRequestEndpoint(),
            JSON.stringify(requestBody));
        
        if (response.status == RESPONSE_STATUS.FAILED) {
            throw new Error(messages.apexGuru.errors.unableToAnalyzeFile(response.message ?? ''));
        } else if (!response.requestId || response.status != RESPONSE_STATUS.NEW) {
            throw Error(messages.apexGuru.errors.returnedUnexpectedResponse(JSON.stringify(response, null, 2)));
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
            queryResponse = await this.request('GET', await this.getRequestEndpoint(requestId));
            if (queryResponse.status === RESPONSE_STATUS.SUCCESS && queryResponse.report) {
                return queryResponse;
            } else if (queryResponse.status === RESPONSE_STATUS.FAILED) {
                throw new Error(messages.apexGuru.errors.unableToAnalyzeFile(queryResponse.message ?? ''));
            } else if (queryResponse.status === RESPONSE_STATUS.ERROR && queryResponse.message) {
                throw new Error(messages.apexGuru.errors.returnedUnexpectedError(queryResponse.message));
            }
        }
        throw new Error(messages.apexGuru.errors.failedToGetResponseBeforeTimeout(this.maxTimeoutSeconds, 
            JSON.stringify(queryResponse, null, 2)));
    }

    private async request<T extends ApexGuruResponse>(method: HttpMethods, endpointUrl: string, body?: string): Promise<T>  {
        const requestObj: HttpRequest = {
            method: method,
            url: endpointUrl,
            body: body
        };

        try {
            this.logger.trace(`Sending request to ApexGuru:\n${JSON.stringify(requestObj, null, 2)}`);
            const responseObj: T = await this.orgConnectionService.request(requestObj);
            this.logger.trace(`Received response from ApexGuru:\n${JSON.stringify(responseObj, null, 2)}`);
            if (typeof(responseObj.status) !== "string") {
                throw new Error(messages.apexGuru.errors.expectedResponseToContainStatusField(
                    JSON.stringify(responseObj, null, 2)));
            }
            // This helps things map to the RESPONSE_STATUS constants with case insensitivity
            responseObj.status = responseObj.status.toLowerCase();
            
            return responseObj;
        } catch (err) {
            this.logger.trace('Call to ApexGuru Service failed:' + getErrorMessage(err));
            return {
                status: RESPONSE_STATUS.ERROR,
                message: getErrorMessage(err),
            } as T;
        }
    }

    private async getValidateEndpoint(): Promise<string> {
        const apiVersion: string = await this.orgConnectionService.getApiVersion();
        return `/services/data/v${apiVersion}/apexguru/validate`;
    }

    private async getRequestEndpoint(requestId?: string): Promise<string> {
        const apiVersion: string = await this.orgConnectionService.getApiVersion();
        return `/services/data/v${apiVersion}/apexguru/request` + (requestId ? `/${requestId}` : '');
    }
}


export function parsePayload(payloadStr: string): ApexGuruViolation[] {
    try {
        return JSON.parse(payloadStr) as ApexGuruViolation[];
    } catch (err) {
        throw new Error(messages.apexGuru.errors.unableToParsePayload(indent(getErrorMessage(err))));
    }
}

function toViolation(apexGuruViolation: ApexGuruViolation, file: string): Violation {
    const codeAnalyzerViolation: Violation = {
        rule: apexGuruViolation.rule,
        engine: APEX_GURU_ENGINE_NAME,
        message: apexGuruViolation.message,
        severity: apexGuruViolation.severity,
        locations: apexGuruViolation.locations.map(l => addFile(l, file)),
        primaryLocationIndex: apexGuruViolation.primaryLocationIndex,
        tags: [], // Currently not used
        resources: apexGuruViolation.resources ?? [],
        suggestions: apexGuruViolation.suggestions?.map(s => {
            s.location = addFile(s.location, file);
            return s;
        }),
        fixes: apexGuruViolation.fixes?.map(f => {
            f.location = addFile(f.location, file);
            return f;
        })
    };
    return codeAnalyzerViolation;
}

function addFile(apexGuruLocation: CodeLocation, filePath: string): CodeLocation {
    return {
        ...apexGuruLocation,
        file: filePath
    };
}

function encodeToBase64(value: string): string {
    return Buffer.from(value).toString('base64');
}

function decodeFromBase64(value: string): string {
    return Buffer.from(value, 'base64').toString('utf-8');
}


type ApexGuruRequestBody = {
    // Must be base64 encoded
    classContent: string
}

type ApexGuruResponse = {
    status: string;
    message?: string;
}

type ApexGuruInitialResponse = ApexGuruResponse & {
    requestId: string;
}

type ApexGuruQueryResponse = ApexGuruResponse & {
    // Is returned with base64 encoding
    report: string;
}

type ApexGuruViolation = {
    rule: string;
    message: string;

    // Note that none of these location objects from ApexGuru will have a "file" field on it
    locations: CodeLocation[];
    primaryLocationIndex: number;
    severity: number;
    resources: string[];

    // Note that each suggestion and fix location from ApexGuru will not have a "file" field on it
    suggestions?: Suggestion[];
    fixes?: Fix[];
}
