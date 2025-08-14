import * as Constants from "../../../../lib/constants";
import { ApexGuruService, LiveApexGuruService } from "../../../../lib/apexguru/apex-guru-service";
import { HttpRequest, OrgConnectionService } from "../../../../lib/external-services/org-connection-service";
import * as stubs from "../../stubs";
import { Violation } from "../../../../lib/diagnostics";

describe("Tests for LiveApexGuruService", () => {
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

    describe("Tests for isApexGuruAvailable", () => {
        it("When no org is authed, then return false", async () => {
            orgConnectionService.isAuthedReturnValue = false;
            expect(await apexGuruService.isApexGuruAvailable()).toEqual(false);
        });

        it('When the ApexGuru validate endpoint does not return success, then return false', async () => {
            orgConnectionService.requestReturnValueForAuthValidation = {
                status: "failed"
            };
            expect(await apexGuruService.isApexGuruAvailable()).toEqual(false);
        });

        it('When the ApexGuru validate endpoint returns success, then return true', async () => {
            orgConnectionService.requestReturnValueForAuthValidation = {
                status: "SUccesS" // Also testing that we check with case insensitivity to be more robust
            };
            expect(await apexGuruService.isApexGuruAvailable()).toEqual(true);

            // Sanity check that the right endpoint was used
            expect(orgConnectionService.requestCallHistory).toHaveLength(1);
            expect(orgConnectionService.requestCallHistory[0].requestOptions).toEqual({
                method: "GET",
                url: "/services/data/v62.0/apexguru/validate"
            });
        });
    });

    describe("Tests for scan", () => {
        it('When initial ApexGuru request does not respond with new status, then error', async () => {
            orgConnectionService.requestReturnValueForInitialRequest = {
                status: "failed",
                requestId: "someRequestId"
            }
            
            await expect(apexGuruService.scan('/some/file.cls')).rejects.toThrow(
                'ApexGuru returned an unexpected response:\n'
                    + JSON.stringify(orgConnectionService.requestReturnValueForInitialRequest, null, 2));
        });

        it('When initial ApexGuru request does not respond with requestId, then error', async () => {
            orgConnectionService.requestReturnValueForInitialRequest = {
                status: "success",
            }
            
            await expect(apexGuruService.scan('/some/file.cls')).rejects.toThrow(
                'ApexGuru returned an unexpected response:\n'
                    + JSON.stringify(orgConnectionService.requestReturnValueForInitialRequest, null, 2));
        });

        it('When ApexGuru polling request responds on first attempt with success, then violations are returned', async () => {
            orgConnectionService.requestReturnValuesForPollingRequests = [
                {status: "succeSs", report: Buffer.from("[]").toString('base64')}
            ];

            const violations: Violation[] = await apexGuruService.scan('/some/file.cls');

            // TODO: Currently we are waiting on the new response schema before we finish implementing this unit test
            // and at that time we should modify this test to return a few violations
            expect(violations).toEqual([]);
        });

        it('When ApexGuru polling request fails on first attempt, then throw error', async () => {
            orgConnectionService.requestReturnValuesForPollingRequests = [
                {status: "failed", report: 'notUsed' }
            ];

            await expect(apexGuruService.scan('/some/file.cls')).rejects.toThrow(
                'ApexGuru was unable to analyze the file.');
        });

        it('When ApexGuru polling request errors on second attempt, then throw error', async () => {
            orgConnectionService.requestReturnValuesForPollingRequests = [
                {status: "new", report: 'notUsed'},
                {status: "error", report: 'notUsed', message: 'Some error message here'},
            ];

            await expect(apexGuruService.scan('/some/file.cls')).rejects.toThrow(
                'ApexGuru returned an unexpected error: Some error message here');

            // Sanity check:
            expect(orgConnectionService.requestCallHistory).toHaveLength(3); // Initial request + 2 polling attempts
        });

        it('When ApexGuru polling request succeeds on third attempt, then violations are returned', async () => {
            orgConnectionService.requestReturnValuesForPollingRequests = [
                {status: "new", report: 'notUsed'},
                {status: "new", report: 'notUsed'},
                {status: "success", report: Buffer.from("[]").toString('base64')},
            ];

            const violations: Violation[] = await apexGuruService.scan('/some/file.cls');

            // TODO: Currently we are waiting on the new response schema before we finish implementing this unit test
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

            
            await expect(apexGuruService.scan('/some/file.cls')).rejects.toThrow(
                'Failed to get a successful response from ApexGuru after 0.1 seconds.');
        });

        it('When ApexGuru response does not contain a status field, then error', async () => {
            orgConnectionService.requestReturnValuesForPollingRequests = [
                {oops: 3},
            ];

            await expect(apexGuruService.scan('/some/file.cls')).rejects.toThrow(
                `ApexGuru returned an unexpected error: ApexGuru returned a response without a 'status' field containing a string value.`);
        });

        it('When ApexGuru response has a status field that is not a string, then error', async () => {
            orgConnectionService.requestReturnValuesForPollingRequests = [
                {status: 1},
            ];

            await expect(apexGuruService.scan('/some/file.cls')).rejects.toThrow(
                `ApexGuru returned an unexpected error: ApexGuru returned a response without a 'status' field containing a string value.`);
        });

        it('When ApexGuru response has a report string that is not valid json encoded as base64, then error', async () => {
            orgConnectionService.requestReturnValuesForPollingRequests = [
                {status: "success", report: Buffer.from("[oops").toString('base64')}
            ];

            await expect(apexGuruService.scan('/some/file.cls')).rejects.toThrow(
                `Unable to parse response from ApexGuru.\n\nError:`);
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

    requestReturnValueForAuthValidation: unknown = {status: "success"};
    requestReturnValueForInitialRequest: unknown = {status: "new", requestId: "someRequestId"};
    requestReturnValuesForPollingRequests: unknown[] = [];
    requestCallHistory: {requestOptions: HttpRequest}[] = [];
    request<T>(requestOptions: HttpRequest): Promise<T> {
        this.requestCallHistory.push({requestOptions});
        if (requestOptions.url === Constants.APEX_GURU_VALIDATE_ENDPOINT) {
            return Promise.resolve(this.requestReturnValueForAuthValidation as T);
        } else if (requestOptions.url === Constants.APEX_GURU_REQUEST_ENDPOINT && requestOptions.method === 'POST') {
            return Promise.resolve(this.requestReturnValueForInitialRequest as T);
        } else if (requestOptions.url.startsWith(Constants.APEX_GURU_REQUEST_ENDPOINT) && requestOptions.method === 'GET') {
            return Promise.resolve((this.requestReturnValuesForPollingRequests as T[]).shift());
        }
        return undefined;
    }
}