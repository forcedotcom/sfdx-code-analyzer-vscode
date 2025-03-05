import { DiffCreateAction } from "../../../lib/actions/diff-create-action";
import * as Constants from '../../../lib/constants';
import {SpyTelemetryService} from "../test-utils";

describe('DiffCreateAction', () => {
	describe('Telemetry events', () => {
		it('Generates telemetry event for successful suggestion creation', async () => {
			const spyTelemetryService: SpyTelemetryService = new SpyTelemetryService();
			const diffCreateAction = new DiffCreateAction('fakeName', {
				callback: (_code: string, _file?: string) => Promise.reject(new Error('Forced error')),
				telemetryService: spyTelemetryService
			});
			await diffCreateAction.run('This arg is irrelevant', 'So is this one');

			expect(spyTelemetryService.sendCommandEventCallHistory).toHaveLength(0);
			expect(spyTelemetryService.sendExceptionCallHistory).toHaveLength(1);
			expect(spyTelemetryService.sendExceptionCallHistory[0].name).toEqual(Constants.TELEM_DIFF_SUGGESTION_FAILED);
			expect(spyTelemetryService.sendExceptionCallHistory[0].errorMessage).toEqual('Forced error');
			expect(spyTelemetryService.sendExceptionCallHistory[0].properties).toHaveProperty('executedCommand', 'fakeName');
		});

		it('Generates telemetry event for unsuccessful suggestion generation', async () => {
			const spyTelemetryService: SpyTelemetryService = new SpyTelemetryService();
			const diffCreateAction = new DiffCreateAction('fakeName', {
				callback: (_code: string, _file?: string) => Promise.resolve(),
				telemetryService: spyTelemetryService
			});
			await diffCreateAction.run('This arg is irrelevant', 'So is this one');

			expect(spyTelemetryService.sendExceptionCallHistory).toHaveLength(0);
			expect(spyTelemetryService.sendCommandEventCallHistory).toHaveLength(1);
			expect(spyTelemetryService.sendCommandEventCallHistory[0].commandName).toEqual(Constants.TELEM_DIFF_SUGGESTION);
			expect(spyTelemetryService.sendCommandEventCallHistory[0].properties.commandSource).toEqual('fakeName');
			expect(spyTelemetryService.sendCommandEventCallHistory[0].properties.languageType).toEqual('apex');
		});
	});
})
