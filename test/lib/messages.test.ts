import {messages} from "../../src/lib/messages";

describe('Tests for messages', () => {
    describe('insights messages', () => {
        it('apexGuruSkipped.noOrgConnection produces expected output', () => {
            const result = messages.insights.apexGuruSkipped.noOrgConnection('Run sf org login web');
            expect(result).toContain('no org is connected');
            expect(result).toContain('Run sf org login web');
        });

        it('apexGuruSkipped.apiUnavailable produces expected output', () => {
            const result = messages.insights.apexGuruSkipped.apiUnavailable('Service is down');
            expect(result).toContain('service is currently unavailable');
            expect(result).toContain('Service is down');
        });

        it('apexGuruSkipped.unexpectedError produces expected output', () => {
            const result = messages.insights.apexGuruSkipped.unexpectedError('Something went wrong');
            expect(result).toContain('unexpected error');
            expect(result).toContain('Something went wrong');
        });

        it('buttons contain expected labels', () => {
            expect(messages.insights.buttons.connectOrg).toEqual('Connect Org');
            expect(messages.insights.buttons.retryScan).toEqual('Retry Scan');
            expect(messages.insights.buttons.details).toEqual('Details');
            expect(messages.insights.buttons.viewDetails).toEqual('View Details');
            expect(messages.insights.buttons.reportIssue).toEqual('Report Issue');
        });

        it('fallback.connectOrgManual produces expected output', () => {
            const result = messages.insights.fallback.connectOrgManual('sf org login web');
            expect(result).toContain('sf org login web');
            expect(result).toContain('run the following in your terminal');
        });
    });
});
