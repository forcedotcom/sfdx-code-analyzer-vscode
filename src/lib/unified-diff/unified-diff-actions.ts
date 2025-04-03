import {TelemetryService} from "../external-services/telemetry-service";
import {UnifiedDiffTool} from "./unified-diff-tool";
import * as Constants from "../constants";
import * as vscode from "vscode";
import {Logger} from "../logger";
import {CodeAnalyzerDiagnostic, DiagnosticManager} from "../diagnostics";
import {FixSuggestion} from "../fix-suggestion";

export class UnifiedDiffActions {
    private readonly unifiedDiffTool: UnifiedDiffTool;
    private readonly diagnosticManager: DiagnosticManager;
    private readonly telemetryService: TelemetryService;
    private readonly logger: Logger;

    constructor(unifiedDiffTool: UnifiedDiffTool, diagnosticManager: DiagnosticManager, telemetryService: TelemetryService, logger: Logger) {
        this.unifiedDiffTool = unifiedDiffTool;
        this.diagnosticManager = diagnosticManager;
        this.telemetryService = telemetryService;
        this.logger = logger;
    }

    hasDiff(document: vscode.TextDocument): boolean {
        return this.unifiedDiffTool.hasDiff(document);
    }

    async showDiffFor(commandSource: string, codeFixSuggestion: FixSuggestion): Promise<void> {
        const diagnostic: CodeAnalyzerDiagnostic = codeFixSuggestion.codeFixData.diagnostic as CodeAnalyzerDiagnostic;
        const document: vscode.TextDocument = codeFixSuggestion.codeFixData.document;
        const suggestedNewDocumentCode: string = codeFixSuggestion.getFixedDocumentCode();
        const numLinesInFix: number = codeFixSuggestion.getFixedCodeLines().length;

        // TODO: These callbacks are A4D specific... so they shouldn't be here... unless we rename this class as A4DActions or something.
        const acceptCallback: ()=>Promise<void> = (): Promise<void> => {
            this.telemetryService.sendCommandEvent(Constants.TELEM_A4D_ACCEPT, {
                commandSource: commandSource,
                completionNumLines: numLinesInFix.toString(),
                languageType: document.languageId
            });

            return Promise.resolve();
        };

        const rejectCallback: ()=>Promise<void> = (): Promise<void> => {
            this.diagnosticManager.addDiagnostics([diagnostic]); // Put back the diagnostic

            this.telemetryService.sendCommandEvent(Constants.TELEM_A4D_REJECT, {
                commandSource: commandSource,
                languageType: document.languageId
            });

            return Promise.resolve();
        };

        const startTime: number = Date.now();
        try {
            this.diagnosticManager.clearDiagnostic(diagnostic);
            await this.unifiedDiffTool.createDiff(document, suggestedNewDocumentCode, acceptCallback, rejectCallback);
        } catch (err) {
            this.handleError(err, Constants.TELEM_A4D_SUGGESTION_FAILED, commandSource, Date.now() - startTime);
            return;
        }

        this.telemetryService.sendCommandEvent(Constants.TELEM_A4D_SUGGESTION, {
            commandSource: commandSource,
            languageType: document.languageId
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
