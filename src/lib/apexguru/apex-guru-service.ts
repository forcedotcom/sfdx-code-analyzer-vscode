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
    getAvailability(): Promise<ApexGuruAvailability>;
    scan(absFileToScan: string): Promise<Violation[]>;
}

export type ApexGuruAvailability = {
    access: ApexGuruAccess,
    message?: string
}

export enum ApexGuruAccess {
    // In this case, ApexGuru scans are allowed
    ENABLED = "enabled",

    // In this case, the org is eligible to be enabled, but an admin hasn't set the permissions yet, so we should still
    // show the scan button but then show a message with the instructions sent from the validate endpoint.
    ELIGIBLE = "eligible-but-not-enabled",

    // In this case, the org is not eligible for ApexGuru at all, so we should not show the scan button at all.
    INELIGIBLE = "ineligible",

    // In this case, the user has not authed into an org, so we should not show the scan button at all.
    NOT_AUTHED = "not-authed"
}

export class LiveApexGuruService implements ApexGuruService {
    private readonly orgConnectionService: OrgConnectionService;
    private readonly fileHandler: FileHandler;
    private readonly logger: Logger;
    private readonly maxTimeoutSeconds: number;
    private readonly retryIntervalMillis: number;
    private availability?: ApexGuruAvailability;

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

    async getAvailability(): Promise<ApexGuruAvailability> {
        if (this.availability === undefined) {
            await this.updateAvailability();
        }
        return this.availability;
    }

    // TODO: Soon with W-18538308 we will be using the connection.onOrgChange to wire up to this
    private async updateAvailability(): Promise<void> {
        if (!this.orgConnectionService.isAuthed()) {
            this.availability = {
                access: ApexGuruAccess.NOT_AUTHED,
                message: messages.apexGuru.noOrgAuthed
            };
            return;
        }

        const response: ApexGuruResponse = await this.request('GET', await this.getValidateEndpoint());

        if (response.status === RESPONSE_STATUS.SUCCESS) {
            this.availability = { access: ApexGuruAccess.ENABLED };
        } else if (response.status === RESPONSE_STATUS.FAILED) {
            this.availability = {
                access: ApexGuruAccess.ELIGIBLE,
                message: response.message
            };
        } else {
            this.availability = {
                access: ApexGuruAccess.INELIGIBLE,
                message: response.message
            }
        }
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
