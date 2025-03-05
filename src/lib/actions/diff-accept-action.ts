import { DiffHunk } from "../../shared/UnifiedDiff";
import * as Constants from '../constants';
import {TelemetryService} from "../external-services/telemetry-service";

export type DiffAcceptCallback = (diffHunk?: DiffHunk) => Promise<number>;

export type DiffAcceptDependencies = {
    callback: DiffAcceptCallback;
    telemetryService: TelemetryService;
};

export class DiffAcceptAction {
    private readonly commandName: string;
    private readonly callback: DiffAcceptCallback;
    private readonly telemetryService: TelemetryService;

    public constructor(commandName: string, dependencies: DiffAcceptDependencies) {
        this.commandName = commandName;
        this.callback = dependencies.callback;
        this.telemetryService = dependencies.telemetryService;
    }

    public async run(diffHunk?: DiffHunk): Promise<void> {
        const startTime = Date.now();
        try {
            const lines: number = await this.callback(diffHunk);
            this.telemetryService.sendCommandEvent(Constants.TELEM_DIFF_ACCEPT, {
                commandSource: this.commandName,
                completionNumLines: lines.toString(),
                languageType: 'apex' // The only rules that the CodeAnalyzer A4D integration supports are Apex-based
            });
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : e as string;
            this.telemetryService.sendException(Constants.TELEM_DIFF_ACCEPT_FAILED, errMsg, {
                executedCommand: this.commandName,
                duration: (Date.now() - startTime).toString()
            })
        }
    }
}
