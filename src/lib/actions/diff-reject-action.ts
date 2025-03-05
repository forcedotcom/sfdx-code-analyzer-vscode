import { DiffHunk } from "../../shared/UnifiedDiff";
import { TelemetryService } from "../core-extension-service";
import * as Constants from '../constants';

export type DiffRejectCallback = (diffHunk?: DiffHunk) => Promise<void>;

export type DiffRejectDependencies = {
	callback: DiffRejectCallback;
	telemetryService: TelemetryService;
};

export class DiffRejectAction {
	private readonly commandName: string;
	private readonly callback: DiffRejectCallback;
	private readonly telemetryService: TelemetryService;

	public constructor(commandName: string, dependencies: DiffRejectDependencies) {
		this.commandName = commandName;
		this.callback = dependencies.callback;
		this.telemetryService = dependencies.telemetryService;
	}

	public async run(diffHunk?: DiffHunk): Promise<void> {
		const startTime = Date.now();
		try {
			await this.callback(diffHunk);
			this.telemetryService.sendCommandEvent(Constants.TELEM_DIFF_REJECT, {
				commandSource: this.commandName,
				languageType: 'apex' // Apex is the only language A4D codegen supports at present.
			});
		} catch (e) {
			const errMsg = e instanceof Error ? e.message : e as string;
			this.telemetryService.sendException(Constants.TELEM_DIFF_REJECT_FAILED, errMsg, {
				executedCommand: this.commandName,
				duration: (Date.now() - startTime).toString()
			})
		}
	}
}
