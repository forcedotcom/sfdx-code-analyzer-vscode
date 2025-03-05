import { DiffHunk } from "../../../shared/UnifiedDiff";
import { DiffAcceptAction } from '../../../lib/actions/diff-accept-action';
import * as Constants from '../../../lib/constants';
import {SpyTelemetryService} from "../test-utils";


describe('DiffAcceptAction', () => {
    describe('Telemetry events', () => {
        it('Generates telemetry event for failed suggestion acceptance', async () => {
            const spyTelemetryService: SpyTelemetryService = new SpyTelemetryService();
            const diffAcceptAction: DiffAcceptAction = new DiffAcceptAction('fakeName', {
                callback: (_diffHunk?: DiffHunk) => Promise.reject(new Error('Forced error')),
                telemetryService: spyTelemetryService
            });
            await diffAcceptAction.run();

            expect(spyTelemetryService.sendCommandEventCallHistory).toHaveLength(0);
            expect(spyTelemetryService.sendExceptionCallHistory).toHaveLength(1);
            expect(spyTelemetryService.sendExceptionCallHistory[0].name).toEqual(Constants.TELEM_DIFF_ACCEPT_FAILED);
            expect(spyTelemetryService.sendExceptionCallHistory[0].errorMessage).toEqual('Forced error');
            expect(spyTelemetryService.sendExceptionCallHistory[0].properties).toHaveProperty('executedCommand', 'fakeName');
        });

        it('Generates telemetry event for successful suggestion acceptance', async () => {
            const spyTelemetryService: SpyTelemetryService = new SpyTelemetryService();
            const diffAcceptAction: DiffAcceptAction = new DiffAcceptAction('fakeName', {
                callback: (_diffHunk?: DiffHunk) => Promise.resolve(5),
                telemetryService: spyTelemetryService
            });
            await diffAcceptAction.run();

            expect(spyTelemetryService.sendExceptionCallHistory).toHaveLength(0);
            expect(spyTelemetryService.sendCommandEventCallHistory).toHaveLength(1);
            expect(spyTelemetryService.sendCommandEventCallHistory[0].commandName).toEqual(Constants.TELEM_DIFF_ACCEPT);
            expect(spyTelemetryService.sendCommandEventCallHistory[0].properties.commandSource).toEqual('fakeName');
            expect(spyTelemetryService.sendCommandEventCallHistory[0].properties.completionNumLines).toEqual('5');
            expect(spyTelemetryService.sendCommandEventCallHistory[0].properties.languageType).toEqual('apex');
        });
    });
});
