import {TelemetryService} from "../external-services/telemetry-service";
import {UnifiedDiffTool} from "./unified-diff-tool";
import * as Constants from "../constants";
import * as vscode from "vscode";
import {Logger} from "../logger";

export class UnifiedDiffActions<T> {
    private readonly unifiedDiffTool: UnifiedDiffTool<T>;
    private readonly telemetryService: TelemetryService;
    private readonly logger: Logger;

    constructor(unifiedDiffTool: UnifiedDiffTool<T>, telemetryService: TelemetryService, logger: Logger) {
        this.unifiedDiffTool = unifiedDiffTool;
        this.telemetryService = telemetryService;
        this.logger = logger;
    }

    async createDiff(commandSource: string, document: vscode.TextDocument, suggestedNewDocumentCode: string): Promise<void> {
        const startTime: number = Date.now();
        try {
            await this.unifiedDiffTool.createDiff(suggestedNewDocumentCode, document.fileName);
        } catch (err) {
            this.handleError(err, Constants.TELEM_DIFF_SUGGESTION_FAILED, commandSource, Date.now() - startTime);
            return;
        }

        this.telemetryService.sendCommandEvent(Constants.TELEM_DIFF_SUGGESTION, {
            commandSource: commandSource,
            languageType: document.languageId
        });
    }

    async acceptAll(commandSource: string, document: vscode.TextDocument): Promise<void> {
        const startTime: number = Date.now();
        let acceptedLines: number;
        try {
            acceptedLines = await this.unifiedDiffTool.acceptAll();
        } catch (err) {
            this.handleError(err, Constants.TELEM_DIFF_ACCEPT_FAILED, commandSource, Date.now() - startTime);
            return;
        }

        this.telemetryService.sendCommandEvent(Constants.TELEM_DIFF_ACCEPT, {
            commandSource: commandSource,
            completionNumLines: acceptedLines.toString(),
            languageType: document.languageId
        });
    }

    async acceptDiffHunk(commandSource: string, document: vscode.TextDocument, diffHunk: T): Promise<void> {
        const startTime: number = Date.now();
        let acceptedLines: number;
        try {
            acceptedLines = await this.unifiedDiffTool.acceptDiffHunk(diffHunk);
        } catch (err) {
            this.handleError(err, Constants.TELEM_DIFF_ACCEPT_FAILED, commandSource, Date.now() - startTime);
            return;
        }

        this.telemetryService.sendCommandEvent(Constants.TELEM_DIFF_ACCEPT, {
            commandSource: commandSource,
            completionNumLines: acceptedLines.toString(),
            languageType: document.languageId
        });
    }

    async rejectAll(commandSource: string, document: vscode.TextDocument): Promise<void> {
        const startTime: number = Date.now();
        try {
            await this.unifiedDiffTool.rejectAll();
        } catch (err) {
            this.handleError(err, Constants.TELEM_DIFF_REJECT_FAILED, commandSource, Date.now() - startTime);
            return;
        }

        this.telemetryService.sendCommandEvent(Constants.TELEM_DIFF_REJECT, {
            commandSource: commandSource,
            languageType: document.languageId
        });
    }

    async rejectDiffHunk(commandSource: string, file: vscode.TextDocument, diffHunk: T): Promise<void> {
        const startTime: number = Date.now();
        try {
            await this.unifiedDiffTool.rejectDiffHunk(diffHunk);
        } catch (err) {
            this.handleError(err, Constants.TELEM_DIFF_REJECT_FAILED, commandSource, Date.now() - startTime);
            return;
        }

        this.telemetryService.sendCommandEvent(Constants.TELEM_DIFF_REJECT, {
            commandSource: commandSource,
            languageType: file.languageId
        });
    }

    private handleError(err: unknown, errCategory: string, fullCommandSource: string, duration: number): void {
        const errMsg: string = err instanceof Error ? err.message : /*istanbul ignore next */ err as string;
        this.logger.error(`${errCategory}: ${errMsg}`);
        this.telemetryService.sendException(errCategory, errMsg, {
            executedCommand: fullCommandSource,
            duration: duration.toString()
        });
    }
}
