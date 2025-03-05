import { Properties, TelemetryService } from "../../../lib/core-extension-service";
import { DiffCreateAction } from "../../../lib/actions/diff-create-action";
import * as Constants from '../../../lib/constants';

describe('DiffCreateAction', () => {
	describe('Telemetry events', () => {
		it('Generates telemetry event for successful suggestion creation', async () => {
			const stubTelemetryService: StubTelemetryService = new StubTelemetryService();
			const diffCreateAction = new DiffCreateAction('fakeName', {
				callback: (_code: string, _file?: string) => Promise.reject(new Error('Forced error')),
				telemetryService: stubTelemetryService
			});
			await diffCreateAction.run('This arg is irrelevant', 'So is this one');

			expect(stubTelemetryService.getSentCommandEvents()).toHaveLength(0);
			expect(stubTelemetryService.getSentExceptions()).toHaveLength(1);
			expect(stubTelemetryService.getSentExceptions()[0].name).toEqual(Constants.TELEM_DIFF_SUGGESTION_FAILED);
			expect(stubTelemetryService.getSentExceptions()[0].message).toEqual('Forced error');
			expect(stubTelemetryService.getSentExceptions()[0].data).toHaveProperty('executedCommand', 'fakeName');
		});

		it('Generates telemetry event for unsuccessful suggestion generation', async () => {
			const stubTelemetryService: StubTelemetryService = new StubTelemetryService();
			const diffCreateAction = new DiffCreateAction('fakeName', {
				callback: (_code: string, _file?: string) => Promise.resolve(),
				telemetryService: stubTelemetryService
			});
			await diffCreateAction.run('This arg is irrelevant', 'So is this one');

			expect(stubTelemetryService.getSentExceptions()).toHaveLength(0);
			expect(stubTelemetryService.getSentCommandEvents()).toHaveLength(1);
			expect(stubTelemetryService.getSentCommandEvents()[0].key).toEqual(Constants.TELEM_DIFF_SUGGESTION);
			expect(stubTelemetryService.getSentCommandEvents()[0].data.commandSource).toEqual('fakeName');
			expect(stubTelemetryService.getSentCommandEvents()[0].data.languageType).toEqual('apex');
		});
	});
})

type TelemetryCommandEventData = {
	key: string;
	data?: Properties;
};

type TelemetryExceptionData = {
	name: string;
	message: string;
	data?: Record<string, string>;
};

class StubTelemetryService implements TelemetryService {
	private commandEventCalls: TelemetryCommandEventData[] = [];
	private exceptionCalls: TelemetryExceptionData[] = [];

	public sendExtensionActivationEvent(_hrStart: [number, number]): void {
		// NO-OP
	}

	public sendCommandEvent(key: string, data: Properties): void {
		this.commandEventCalls.push({
			key,
			data
		});
	}

	public sendException(name: string, message: string, data?: Record<string, string>): void {
		this.exceptionCalls.push({
			name,
			message,
			data
		});
	}

	public getSentCommandEvents(): TelemetryCommandEventData[] {
		return this.commandEventCalls;
	}

	public getSentExceptions(): TelemetryExceptionData[] {
		return this.exceptionCalls;
	}

	public dispose(): void {
		// NO-OP
	}
}
