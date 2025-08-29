import { ApexGuruAccess, ApexGuruService, LiveApexGuruService } from "../../../../lib/apexguru/apex-guru-service";
import { HttpRequest, OrgConnectionService } from "../../../../lib/external-services/org-connection-service";
import * as stubs from "../../stubs";
import { Violation } from "../../../../lib/diagnostics";

describe("Tests for LiveApexGuruService", () => {
    const sampleFile: string = '/some/file.cls';

    const sampleApexGuruPayload = [
        {
            "rule": "SchemaGetGlobalDescribeNotEfficient",
            "message": "Avoid using Schema.getGlobalDescribe() in Apex. This method causes unnecessary overhead, decreases performance, and increases the latency of the associated entry point.",
            "locations": [
                {
                    "startLine": 4,
                    "comment": "api_class.processAccountsAndContacts"
                }
            ],
            "primaryLocationIndex": 0,
            "resources": [
                "https://help.salesforce.com/s/articleView?id=xcloud.apexguru_antipattern_schema_getglobaldescribe_not_efficient.htm&type=5"
            ],
            "severity": 2,
            "fixes": [
                {
                    "location": {
                        "startLine": 4,
                        "startColumn": 8,
                        "comment": "api_class.processAccountsAndContacts"
                    },
                    "fixedCode": "Schema.DescribeSObjectResult opportunityDescribe = Opportunity.sObjectType.getDescribe();",
                }
            ]
        },
        {
            "rule": "SoqlInALoop",
            "message": "You're calling an expensive SOQL in a loop, which can cause performance issues. Optimize your SOQL to call once and reuse the return value.",
            "locations": [
                {
                    "startLine": 7,
                    "comment": "api_class.processAccountsAndContacts"
                }
            ],
            "primaryLocationIndex": 0,
            "resources": [
                "https://help.salesforce.com/s/articleView?id=xcloud.apexguru_antipattern_soql_in_loop.htm&type=5"
            ],
            "severity": 3,
            "suggestions": [
                {
                    "location": {
                        "startLine": 7,
                        "comment": "api_class.processAccountsAndContacts"
                    },
                    "message": "Sample suggestion message",
                }
            ]
        }
    ];

    const expectedViolations: Violation[] = [
        {
            rule: "SchemaGetGlobalDescribeNotEfficient",
            engine: "apexguru",
            message: "Avoid using Schema.getGlobalDescribe() in Apex. This method causes unnecessary overhead, decreases performance, and increases the latency of the associated entry point.",
            severity: 2,
            locations: [
                {
                    file: sampleFile,
                    startLine: 4,
                    comment: "api_class.processAccountsAndContacts",
                }
            ],
            primaryLocationIndex: 0,
            tags: [],
            resources: [
                "https://help.salesforce.com/s/articleView?id=xcloud.apexguru_antipattern_schema_getglobaldescribe_not_efficient.htm&type=5"
            ],
            fixes: [
                {
                    location: {
                        file: sampleFile,
                        startLine: 4,
                        startColumn: 8,
                        comment: "api_class.processAccountsAndContacts",
                    },
                    fixedCode: "Schema.DescribeSObjectResult opportunityDescribe = Opportunity.sObjectType.getDescribe();",
                }
            ]
        },
        {
            rule: "SoqlInALoop",
            engine: "apexguru",
            message: "You're calling an expensive SOQL in a loop, which can cause performance issues. Optimize your SOQL to call once and reuse the return value.",
            severity: 3,
            locations: [
                {
                    file: sampleFile,
                    startLine: 7,
                    comment: "api_class.processAccountsAndContacts"
                }
            ],
            primaryLocationIndex: 0,
            tags: [],
            resources: [
                "https://help.salesforce.com/s/articleView?id=xcloud.apexguru_antipattern_soql_in_loop.htm&type=5"
            ],
            suggestions: [
                {
                    location: {
                        file: sampleFile,
                        startLine: 7,
                        comment: "api_class.processAccountsAndContacts",
                    },
                    message: "Sample suggestion message",
                }
            ]
        }
    ];

    let orgConnectionService: StubOrgConnectionServiceForApexGuru;
    let fileHandler: stubs.StubFileHandler;
    let logger: stubs.SpyLogger;
    let apexGuruService: ApexGuruService;

    beforeEach(() => {
        orgConnectionService = new StubOrgConnectionServiceForApexGuru();
        fileHandler = new stubs.StubFileHandler();
        fileHandler.readFileReturnValue = 'dummyContent';
        logger = new stubs.SpyLogger();
        const maxTimeOutSecs: number = 3; // Defaulting to 3 seconds for worse case scenario, but the below tests shouldn't depend on it
        const retryIntervalMillis: number = 5; // Reducing to keep polling based tests fast
        apexGuruService = new LiveApexGuruService(orgConnectionService, fileHandler, logger, maxTimeOutSecs, retryIntervalMillis);
    });

    describe("Tests for getAvailability", () => {
        it('When no org is authed, then return NOT_AUTHED availability', async () => {
            orgConnectionService.isAuthedReturnValue = false;
            expect(await apexGuruService.getAvailability()).toEqual({
                access: ApexGuruAccess.NOT_AUTHED,
                message: "No org is authed."
            });
        });

        it('When the ApexGuru validate endpoint returns an error status, then return INELIGIBLE availability', async () => {
            orgConnectionService.requestReturnValueForAuthValidation = {
                status: "error",
                message: "some error message"
            };
            expect(await apexGuruService.getAvailability()).toEqual({
                access: ApexGuruAccess.INELIGIBLE,
                message: "some error message"
            });
        });

        it('When the ApexGuru validate endpoint returns an failed status without a message, then we fill in with our own message', async () => {
            // In production this should never happen. Just testing this case to make sure things don't blow up and we 
            // do something reasonable.
            orgConnectionService.requestReturnValueForAuthValidation = {
                status: "failed"
            };
            expect(await apexGuruService.getAvailability()).toEqual({
                access: ApexGuruAccess.ELIGIBLE,
                message: "ApexGuru access is not enabled. Response:  {\"status\":\"failed\"}"
            });
        });

        it('When the ApexGuru validate endpoint returns a failed status, then return ELIGIBLE availability', async () => {
            orgConnectionService.requestReturnValueForAuthValidation = {
                status: "failed",
                message: "some instruction on how to enable ApexGuru"
            };
            expect(await apexGuruService.getAvailability()).toEqual({
                access: ApexGuruAccess.ELIGIBLE,
                message: "some instruction on how to enable ApexGuru"
            });
        });

        it('When the ApexGuru validate endpoint returns success, then return ENABLED availability', async () => {
            orgConnectionService.requestReturnValueForAuthValidation = {
                status: "SUccesS" // Also testing that we check with case insensitivity to be more robust
            };
            expect(await apexGuruService.getAvailability()).toEqual({
                access: ApexGuruAccess.ENABLED,
                message: "ApexGuru access is enabled."
            });

            // Sanity check that the right endpoint was used
            expect(orgConnectionService.requestCallHistory).toHaveLength(1);
            expect(orgConnectionService.requestCallHistory[0].requestOptions).toEqual({
                method: "GET",
                url: "/services/data/v64.0/apexguru/validate"
            });
        });
    });

    describe("Tests for scan", () => {
        it('When ApexGuru responds to initial with failed status, then error', async () => {
            orgConnectionService.requestReturnValueForInitialRequest = {
                status: "failed",
                message: "Some Failure Message"
            }
            
            await expect(apexGuruService.scan(sampleFile)).rejects.toThrow(
                'ApexGuru was unable to analyze the file. Some Failure Message');
        });

        it('When ApexGuru responds to initial without a new or failed status, then error', async () => {
            orgConnectionService.requestReturnValueForInitialRequest = {
                status: "other",
                requestId: "someRequestId"
            }
            
            await expect(apexGuruService.scan(sampleFile)).rejects.toThrow(
                'ApexGuru returned an unexpected response:\n'
                    + JSON.stringify(orgConnectionService.requestReturnValueForInitialRequest, null, 2));
        });

        it('When initial ApexGuru request does not respond with requestId, then error', async () => {
            orgConnectionService.requestReturnValueForInitialRequest = {
                status: "success",
            }
            
            await expect(apexGuruService.scan(sampleFile)).rejects.toThrow(
                'ApexGuru returned an unexpected response:\n'
                    + JSON.stringify(orgConnectionService.requestReturnValueForInitialRequest, null, 2));
        });

        it('When ApexGuru polling request responds on first attempt with success, then violations are returned', async () => {

            orgConnectionService.requestReturnValuesForPollingRequests = [
                {status: "succeSs", report: Buffer.from(JSON.stringify(sampleApexGuruPayload)).toString('base64')}
            ];

            const violations: Violation[] = await apexGuruService.scan(sampleFile);

            expect(violations).toEqual(expectedViolations);
        });

        it('When ApexGuru polling request fails on first attempt, then throw error', async () => {
            orgConnectionService.requestReturnValuesForPollingRequests = [
                {status: "failed", report: 'notUsed' }
            ];

            await expect(apexGuruService.scan(sampleFile)).rejects.toThrow(
                'ApexGuru was unable to analyze the file.');
        });

        it('When ApexGuru polling request errors on second attempt, then throw error', async () => {
            orgConnectionService.requestReturnValuesForPollingRequests = [
                {status: "new", report: 'notUsed'},
                {status: "error", report: 'notUsed', message: 'Some error message here'},
            ];

            await expect(apexGuruService.scan(sampleFile)).rejects.toThrow(
                'ApexGuru returned an unexpected error: Some error message here');

            // Sanity check:
            expect(orgConnectionService.requestCallHistory).toHaveLength(3); // Initial request + 2 polling attempts
        });

        it('When ApexGuru polling request succeeds on third attempt with violations, then violations are returned', async () => {
            orgConnectionService.requestReturnValuesForPollingRequests = [
                {status: "new", report: 'notUsed'},
                {status: "new", report: 'notUsed'},
                {status: "success", report: Buffer.from(JSON.stringify(sampleApexGuruPayload)).toString('base64')},
            ];

            const violations: Violation[] = await apexGuruService.scan(sampleFile);

            expect(violations).toEqual(expectedViolations);

            // Sanity check:
            expect(orgConnectionService.requestCallHistory).toHaveLength(4); // Initial request + 3 polling attempts
        });

        it('When ApexGuru polling request succeeds on third attempt with zero violations, then zero violations are returned', async () => {
            orgConnectionService.requestReturnValuesForPollingRequests = [
                {status: "new", report: 'notUsed'},
                {status: "new", report: 'notUsed'},
                {status: "success", report: Buffer.from("[]").toString('base64')},
            ];

            const violations: Violation[] = await apexGuruService.scan(sampleFile);

            expect(violations).toEqual([]);

            // Sanity check:
            expect(orgConnectionService.requestCallHistory).toHaveLength(4); // Initial request + 3 polling attempts
        });

        it('When ApexGuru polilng request reaches timeout withot succeeding, then throw error', async () => {
            orgConnectionService.requestReturnValuesForPollingRequests = [
                {status: "new", report: 'notUsed'},
                {status: "new", report: 'notUsed'},
                {status: "new", report: 'notUsed'},
                {status: "new", report: 'notUsed'}
            ];

            const maxTimeOutSecs: number = 0.1; // Timeout after one tenth of a second
            const retryIntervalMillis: number = 50; // Only retry every 50 milliseconds and thus should only have 2 to 3 max attempts
            apexGuruService = new LiveApexGuruService(orgConnectionService, fileHandler, logger, maxTimeOutSecs, retryIntervalMillis);

            
            await expect(apexGuruService.scan(sampleFile)).rejects.toThrow(
                'Failed to get a successful response from ApexGuru after 0.1 seconds.');
        });

        it('When ApexGuru response does not contain a status field, then error', async () => {
            orgConnectionService.requestReturnValuesForPollingRequests = [
                {oops: 3},
            ];

            await expect(apexGuruService.scan(sampleFile)).rejects.toThrow(
                `ApexGuru returned an unexpected error: ApexGuru returned a response without a 'status' field containing a string value.`);
        });

        it('When ApexGuru response has a status field that is not a string, then error', async () => {
            orgConnectionService.requestReturnValuesForPollingRequests = [
                {status: 1},
            ];

            await expect(apexGuruService.scan(sampleFile)).rejects.toThrow(
                `ApexGuru returned an unexpected error: ApexGuru returned a response without a 'status' field containing a string value.`);
        });

        it('When ApexGuru response has a report string that is not valid json encoded as base64, then error', async () => {
            orgConnectionService.requestReturnValuesForPollingRequests = [
                {status: "success", report: Buffer.from("[oops").toString('base64')}
            ];

            await expect(apexGuruService.scan(sampleFile)).rejects.toThrow(
                `Unable to parse the payload from the response from ApexGuru. Error:\n    Unexpected token`);
        });
    });
});


export class StubOrgConnectionServiceForApexGuru implements OrgConnectionService {
    isAuthedReturnValue: boolean = true;
    isAuthed(): boolean {
        return this.isAuthedReturnValue;
    }

    onOrgChangeCallHistory: {callback: () => void}[] = [];
    onOrgChange(callback: () => void): void {
        this.onOrgChangeCallHistory.push({callback});
    }

    getApiVersion(): Promise<string> {
        return Promise.resolve('64.0');
    }

    requestReturnValueForAuthValidation: unknown = {status: "success"};
    requestReturnValueForInitialRequest: unknown = {status: "new", requestId: "someRequestId"};
    requestReturnValuesForPollingRequests: unknown[] = [];
    requestCallHistory: {requestOptions: HttpRequest}[] = [];
    request<T>(requestOptions: HttpRequest): Promise<T> {
        this.requestCallHistory.push({requestOptions});
        if (requestOptions.url.endsWith('/apexguru/validate')) {
            return Promise.resolve(this.requestReturnValueForAuthValidation as T);
        } else if (requestOptions.url.endsWith('/apexguru/request') && requestOptions.method === 'POST') {
            return Promise.resolve(this.requestReturnValueForInitialRequest as T);
        } else if (requestOptions.url.includes('/apexguru/request/') && requestOptions.method === 'GET') {
            return Promise.resolve((this.requestReturnValuesForPollingRequests as T[]).shift());
        }
        throw new Error(`Unhandled request: ${JSON.stringify(requestOptions)}`);
    }
}