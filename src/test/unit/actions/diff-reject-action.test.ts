import { DiffHunk } from "../../../shared/UnifiedDiff";
import { DiffRejectAction } from '../../../lib/actions/diff-reject-action';
import * as Constants from '../../../lib/constants';
import {SpyTelemetryService} from "../test-utils";


describe('DiffRejectAction', () => {
    describe('Telemetry events', () => {
        it('Generates telemetry event for failed suggestion rejection', async () => {
            const spyTelemetryService: SpyTelemetryService = new SpyTelemetryService();
            const diffRejectAction: DiffRejectAction = new DiffRejectAction('fakeName', {
                callback: (_diffHunk?: DiffHunk) => Promise.reject(new Error('Forced error')),
                telemetryService: spyTelemetryService
            });
            await diffRejectAction.run();

            expect(spyTelemetryService.sendCommandEventCallHistory).toHaveLength(0);
            expect(spyTelemetryService.sendExceptionCallHistory).toHaveLength(1);
            expect(spyTelemetryService.sendExceptionCallHistory[0].name).toEqual(Constants.TELEM_DIFF_REJECT_FAILED);
            expect(spyTelemetryService.sendExceptionCallHistory[0].errorMessage).toEqual('Forced error');
            expect(spyTelemetryService.sendExceptionCallHistory[0].properties).toHaveProperty('executedCommand', 'fakeName');
        });

        it('Generates telemetry event for successful suggestion rejection', async () => {
            const spyTelemetryService: SpyTelemetryService = new SpyTelemetryService();
            const diffRejectAction: DiffRejectAction = new DiffRejectAction('fakeName', {
                callback: (_diffHunk?: DiffHunk) => Promise.resolve(),
                telemetryService: spyTelemetryService
            });
            await diffRejectAction.run();

            expect(spyTelemetryService.sendExceptionCallHistory).toHaveLength(0);
            expect(spyTelemetryService.sendCommandEventCallHistory).toHaveLength(1);
            expect(spyTelemetryService.sendCommandEventCallHistory[0].commandName).toEqual(Constants.TELEM_DIFF_REJECT);
            expect(spyTelemetryService.sendCommandEventCallHistory[0].properties.commandSource).toEqual('fakeName');
            expect(spyTelemetryService.sendCommandEventCallHistory[0].properties.languageType).toEqual('apex');

        });
    });
});
