import { ApexGuruAccess, ApexGuruService, LiveApexGuruService } from "../../../src/lib/apexguru/apex-guru-service";
import { HttpRequest, OrgConnectionService, OrgUserInfo } from "../../../src/lib/external-services/org-connection-service";
import * as stubs from "../../stubs";
import { Violation } from "../../../src/lib/diagnostics";
import { expectEventuallyIsTrue } from "../../test-utils";

describe("Tests for LiveApexGuruService", () => {
    const sampleFile: string = '/some/file.cls';
    const sampleContent: string = 
        `public class ConsolidatedClass {\n` +
        `    public static void processAccountsAndContacts(List<Account> accounts) {\n` +
        `        // Antipattern [Avoid using Schema.getGlobalDescribe() in Apex]:  (has fix)\n` +
        `        Schema.DescribeSObjectResult opportunityDescribe = Schema.getGlobalDescribe().get('Opportunity').getDescribe();\n` +
        `        System.debug('Opportunity Describe: ' + opportunityDescribe);\n` +
        `\n` +
        `        for (Account acc : accounts) {\n` +
        `            // Antipattern [SOQL in loop]:\n` +
        `            List<Contact> contacts = [SELECT Id, Email FROM Contact WHERE AccountId = :acc.Id];\n` +
        `            for (Contact con : contacts) {\n` +
        `                con.Email = 'newemail@example.com';\n` +
        `                // Antipattern [DML in loop]:\n` +
        `                update con;\n` +
        `            }\n` +
        `        }\n` +
        `\n` +
        `        // Antipattern [SOQL with negative expression]:\n` +
        `        List<Contact> contactsNotInUS = [SELECT Id, FirstName, LastName FROM Contact WHERE MailingCountry != 'US'];\n` +
        `        System.debug('Contacts not in US: ' + contactsNotInUS);\n` +
        `\n` +
        `        // Antipattern [SOQL without WHERE clause or LIMIT]:\n` +
        `        List<Account> allAccounts = [SELECT Id, Name FROM Account];\n` +
        `        System.debug('All Accounts: ' + allAccounts);\n` +
        `\n` +
        `        // Antipattern [Using a list of SObjects for an IN-bind to ID in a SOQL]:  (has suggestion)\n` +
        `        List<Contact> contactsFromAccounts = [SELECT Id, FirstName, LastName FROM Contact WHERE AccountId IN :accounts];\n` +
        `        System.debug('Contacts from Accounts: ' + contactsFromAccounts);\n` +
        `\n` +
        `        // Antipattern [SOQL with wildcard filters]:\n` +
        `        List<Account> accountsWithWildcard = [SELECT Id, Name FROM Account WHERE Name LIKE '%Corp%'];\n` +
        `        System.debug('Accounts with wildcard: ' + accountsWithWildcard);\n` +
        `    }\n` +
        `}`;

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
                    startColumn: 1,
                    endLine: 4,
                    endColumn: 120,
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
                        endLine: 4,
                        endColumn: 120,
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
                    startColumn: 1,
                    endLine: 7,
                    endColumn: 39,
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
                        startColumn: 1,
                        endLine: 7,
                        endColumn: 39,
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
        fileHandler.readFileReturnValue = sampleContent;
        logger = new stubs.SpyLogger();
        const maxTimeOutSecs: number = 3; // Defaulting to 3 seconds for worse case scenario, but the below tests shouldn't depend on it
        const retryIntervalMillis: number = 5; // Reducing to keep polling based tests fast
        apexGuruService = new LiveApexGuruService(orgConnectionService, fileHandler, logger, maxTimeOutSecs, retryIntervalMillis);
    });

    describe("Tests for updateAvailability and getAvailability", () => {
        it('When getAvailability is called before updateAvailability (which should never happen in production), then error', () => {
            expect(() => apexGuruService.getAvailability()).toThrow(
                'The getAvailability method should not be called until updateAvailability is first called');
        });

        it('When no org is authed, then return NOT_AUTHED availability', async () => {
            orgConnectionService.isAuthedReturnValue = false;
            await apexGuruService.updateAvailability();
            expect(apexGuruService.getAvailability()).toEqual({
                access: ApexGuruAccess.NOT_AUTHED,
                message: "No org is authed."
            });
        });

        it('When the ApexGuru validate endpoint returns an error status, then return INELIGIBLE availability', async () => {
            orgConnectionService.requestReturnValueForAuthValidation = {
                status: "error",
                message: "some error message"
            };
            await apexGuruService.updateAvailability();
            expect(apexGuruService.getAvailability()).toEqual({
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
            await apexGuruService.updateAvailability();
            expect(apexGuruService.getAvailability()).toEqual({
                access: ApexGuruAccess.ELIGIBLE,
                message: "ApexGuru access is not enabled. Response:  {\"status\":\"failed\"}"
            });
        });

        it('When the ApexGuru validate endpoint returns a failed status, then return ELIGIBLE availability', async () => {
            orgConnectionService.requestReturnValueForAuthValidation = {
                status: "failed",
                message: "some instruction on how to enable ApexGuru"
            };
            await apexGuruService.updateAvailability();
            expect(apexGuruService.getAvailability()).toEqual({
                access: ApexGuruAccess.ELIGIBLE,
                message: "some instruction on how to enable ApexGuru"
            });
        });

        it('When the ApexGuru validate endpoint returns success, then return ENABLED availability', async () => {
            orgConnectionService.requestReturnValueForAuthValidation = {
                status: "SUccesS" // Also testing that we check with case insensitivity to be more robust
            };
            await apexGuruService.updateAvailability();
            expect(apexGuruService.getAvailability()).toEqual({
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

        it("When an org auth change occurs, then the updateAvailability method should automatically be called", async () => {
            expect(orgConnectionService.onOrgChangeCallHistory).toHaveLength(1);
            const triggerOrgChangeCallback = orgConnectionService.onOrgChangeCallHistory[0].callback;

            // The source code uses async behavior, so we use expectEventuallyIsTrue to help test that something evenutally happes
            orgConnectionService.isAuthedReturnValue = false;
            triggerOrgChangeCallback({alias: 'org1'});
            await expectEventuallyIsTrue(() => apexGuruService.getAvailability().access === ApexGuruAccess.NOT_AUTHED);

            orgConnectionService.isAuthedReturnValue = true;
            triggerOrgChangeCallback({alias: 'org2'});
            await expectEventuallyIsTrue(() => apexGuruService.getAvailability().access === ApexGuruAccess.ENABLED);
        });

        it("When the updateAvailability method is called and changes the access level, then the onAccessChange method is called", async () => {
            let latestAccess: ApexGuruAccess | undefined = undefined;
            apexGuruService.onAccessChange((access: ApexGuruAccess) => {
                latestAccess = access;
            });
            await apexGuruService.updateAvailability();

            expect(latestAccess).toEqual(ApexGuruAccess.ENABLED);
        });

        it("When the updateAvailability method is called but does not change the access level, then the onAccessChange method is not called", async () => {
            let wasCalled: boolean = false;
            await apexGuruService.updateAvailability(); // First set it
            apexGuruService.onAccessChange((_access: ApexGuruAccess) => {
                wasCalled = true;
            });

            await apexGuruService.updateAvailability(); // Call it again ... 
            expect(wasCalled).toEqual(false); // ... since nothing changed this should not have been called
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

    onOrgChangeCallHistory: {callback: (orgUserInfo: OrgUserInfo) => void}[] = [];
    onOrgChange(callback: (orgUserInfo: OrgUserInfo) => void): void {
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