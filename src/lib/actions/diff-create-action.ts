import {TelemetryService} from '../core-extension-service';
import * as Constants from '../constants';

export type DiffCreateCallback = (code: string, file?: string) => Promise<void>;

export type DiffCreateDependencies = {
	callback: DiffCreateCallback;
	telemetryService: TelemetryService;
};

export class DiffCreateAction {
	private readonly commandName: string;
	private readonly callback: DiffCreateCallback;
	private readonly telemetryService: TelemetryService;

	public constructor(commandName: string, dependencies: DiffCreateDependencies) {
		this.commandName = commandName;
		this.callback = dependencies.callback;
		this.telemetryService = dependencies.telemetryService;
	}

	public async run(code: string, file?: string): Promise<void> {
		const startTime = Date.now();
		try {
			await this.callback(code, file);
			this.telemetryService.sendCommandEvent(Constants.TELEM_DIFF_SUGGESTION, {
				commandSource: this.commandName,
				languageType: 'apex' // The only rules that the CodeAnalyzer A4D integration supports are Apex-based
			});
		} catch (e) {
			const errMsg = e instanceof Error ? e.message : e as string;
			this.telemetryService.sendException(Constants.TELEM_DIFF_SUGGESTION_FAILED, errMsg, {
				executedCommand: this.commandName,
				duration: (Date.now() - startTime).toString()
			});
		}
	}
}
