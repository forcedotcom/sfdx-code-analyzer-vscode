import { Properties, TelemetryService } from "../../../lib/core-extension-service";
import { DiffHunk } from "../../../shared/UnifiedDiff";
import { DiffAcceptAction } from '../../../lib/actions/diff-accept-action';
import * as Constants from '../../../lib/constants';


describe('DiffAcceptAction', () => {
	describe('Telemetry events', () => {
		it('Generates telemetry event for failed suggestion acceptance', async () => {
			const stubTelemetryService: StubTelemetryService = new StubTelemetryService();
			const diffAcceptAction: DiffAcceptAction = new DiffAcceptAction('fakeName', {
				callback: (_diffHunk?: DiffHunk) => Promise.reject(new Error('Forced error')),
				telemetryService: stubTelemetryService
			});
			await diffAcceptAction.run();

			expect(stubTelemetryService.getSentCommandEvents()).toHaveLength(0);
			expect(stubTelemetryService.getSentExceptions()).toHaveLength(1);
			expect(stubTelemetryService.getSentExceptions()[0].name).toEqual(Constants.TELEM_DIFF_ACCEPT_FAILED);
			expect(stubTelemetryService.getSentExceptions()[0].message).toEqual('Forced error');
			expect(stubTelemetryService.getSentExceptions()[0].data).toHaveProperty('executedCommand', 'fakeName');
		});

		it('Generates telemetry event for successful suggestion acceptance', async () => {
			const stubTelemetryService: StubTelemetryService = new StubTelemetryService();
			const diffAcceptAction: DiffAcceptAction = new DiffAcceptAction('fakeName', {
				callback: (_diffHunk?: DiffHunk) => Promise.resolve(5),
				telemetryService: stubTelemetryService
			});
			await diffAcceptAction.run();

			expect(stubTelemetryService.getSentExceptions()).toHaveLength(0);
			expect(stubTelemetryService.getSentCommandEvents()).toHaveLength(1);
			expect(stubTelemetryService.getSentCommandEvents()[0].key).toEqual(Constants.TELEM_DIFF_ACCEPT);
			expect(stubTelemetryService.getSentCommandEvents()[0].data.commandSource).toEqual('fakeName');
			expect(stubTelemetryService.getSentCommandEvents()[0].data.completionNumLines).toEqual('5');
			expect(stubTelemetryService.getSentCommandEvents()[0].data.languageType).toEqual('apex');
		});
	});
});

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
