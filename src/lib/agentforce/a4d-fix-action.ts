import {TelemetryService} from "../external-services/telemetry-service";
import {UnifiedDiffService} from "../unified-diff-service";
import * as Constants from "../constants";
import * as vscode from "vscode";
import {Logger} from "../logger";
import {CodeAnalyzerDiagnostic, DiagnosticManager} from "../diagnostics";
import {FixSuggester, FixSuggestion} from "../fix-suggestion";
import {messages} from "../messages";
import {Display} from "../display";
import {getErrorMessage, getErrorMessageWithStack} from "../utils";

export class A4DFixAction {
    private readonly fixSuggester: FixSuggester;
    private readonly unifiedDiffService: UnifiedDiffService;
    private readonly diagnosticManager: DiagnosticManager;
    private readonly telemetryService: TelemetryService;
    private readonly logger: Logger;
    private readonly display: Display;

    constructor(fixSuggester: FixSuggester, unifiedDiffService: UnifiedDiffService, diagnosticManager: DiagnosticManager, telemetryService: TelemetryService, logger: Logger, display: Display) {
        this.fixSuggester = fixSuggester;
        this.unifiedDiffService = unifiedDiffService;
        this.diagnosticManager = diagnosticManager;
        this.telemetryService = telemetryService;
        this.logger = logger;
        this.display = display;
    }

    async run(document: vscode.TextDocument, diagnostic: CodeAnalyzerDiagnostic): Promise<void> {
        const startTime: number = Date.now();
        try {
            if (this.unifiedDiffService.hasDiff(document)) {
                this.display.displayWarning(messages.unifiedDiff.mustAcceptOrRejectDiffFirst);
                return;
            }

            const fixSuggestion: FixSuggestion = await this.fixSuggester.suggestFix(document, diagnostic);
            if (!fixSuggestion) {
                this.display.displayInfo(messages.agentforce.noFixSuggested);
                return;
            }

            this.logger.debug(`Agentforce Fix Diff:\n` +
                `=== ORIGINAL CODE ===:\n${fixSuggestion.getOriginalCodeToBeFixed()}\n\n` +
                `=== FIXED CODE ===:\n${fixSuggestion.getFixedCode()}`);

            await this.displayDiffFor(fixSuggestion);

            if (fixSuggestion.hasExplanation()) {
                this.display.displayInfo(messages.agentforce.explanationOfFix(fixSuggestion.getExplanation()));
            }
        } catch (err) {
            this.handleError(err, Constants.TELEM_A4D_SUGGESTION_FAILED, Date.now() - startTime);
            await this.unifiedDiffService.clearDiff(document);
            return;
        }
    }

    private async displayDiffFor(codeFixSuggestion: FixSuggestion): Promise<void> {
        const diagnostic: CodeAnalyzerDiagnostic = codeFixSuggestion.codeFixData.diagnostic as CodeAnalyzerDiagnostic;
        const document: vscode.TextDocument = codeFixSuggestion.codeFixData.document;
        const suggestedNewDocumentCode: string = codeFixSuggestion.getFixedDocumentCode();
        const numLinesInFix: number = codeFixSuggestion.getFixedCodeLines().length;

        const acceptCallback: ()=>Promise<void> = (): Promise<void> => {
            this.telemetryService.sendCommandEvent(Constants.TELEM_A4D_ACCEPT, {
                commandSource: Constants.QF_COMMAND_A4D_FIX,
                completionNumLines: numLinesInFix.toString(),
                languageType: document.languageId
            });
            return Promise.resolve();
        };

        const rejectCallback: ()=>Promise<void> = (): Promise<void> => {
            this.diagnosticManager.addDiagnostics([diagnostic]); // Put back the diagnostic

            this.telemetryService.sendCommandEvent(Constants.TELEM_A4D_REJECT, {
                commandSource: Constants.QF_COMMAND_A4D_FIX,
                languageType: document.languageId
            });

            return Promise.resolve();
        };

        this.diagnosticManager.clearDiagnostic(diagnostic);
        await this.unifiedDiffService.showDiff(document, suggestedNewDocumentCode, acceptCallback, rejectCallback);

        this.telemetryService.sendCommandEvent(Constants.TELEM_A4D_SUGGESTION, {
            commandSource: Constants.QF_COMMAND_A4D_FIX,
            languageType: document.languageId
        });
    }

    private handleError(err: unknown, errCategory: string, duration: number): void {
        this.display.displayError(`${messages.agentforce.failedA4DResponse}\n${getErrorMessage(err)}`);
        this.telemetryService.sendException(errCategory, getErrorMessageWithStack(err), {
            executedCommand: Constants.QF_COMMAND_A4D_FIX,
            duration: duration.toString()
        });
    }
}
