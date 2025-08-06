import * as vscode from "vscode";
import * as Constants from "./constants"
import {TelemetryService} from "./external-services/telemetry-service";
import {UnifiedDiffService} from "./unified-diff-service";
import {Logger} from "./logger";
import {CodeAnalyzerDiagnostic, DiagnosticManager} from "./diagnostics";
import {FixSuggestion} from "./fix-suggestion";
import {messages} from "./messages";
import {Display} from "./display";
import {getErrorMessage, getErrorMessageWithStack} from "./utils";

const NO_FIX_REASON = {
    UNIFIED_DIFF_CANNOT_BE_SHOWN: 'unified_diff_cannot_be_shown',
    EMPTY: 'empty',
    SAME_CODE: 'same_code'
}

/**
 * Abstract class to help share the unified diff functionality and accept/reject telemetry with various quick fix commands
 */
export abstract class SuggestFixWithDiffAction {
    private readonly unifiedDiffService: UnifiedDiffService;
    private readonly diagnosticManager: DiagnosticManager;
    private readonly telemetryService: TelemetryService;
    protected readonly logger: Logger;
    private readonly display: Display;

    protected abstract suggestFix(diagnostic: CodeAnalyzerDiagnostic, document: vscode.TextDocument): Promise<FixSuggestion | null>
    
    protected abstract getCommandSource(): string
    protected abstract getFixSuggestedTelemEventName(): string
    protected abstract getFixSuggestionFailedTelemEventName(): string
    protected abstract getFixAcceptedTelemEventName(): string
    protected abstract getFixRejectedTelemEventName(): string

    constructor(unifiedDiffService: UnifiedDiffService, diagnosticManager: DiagnosticManager,
                telemetryService: TelemetryService, logger: Logger, display: Display) {
        this.unifiedDiffService = unifiedDiffService;
        this.diagnosticManager = diagnosticManager;
        this.telemetryService = telemetryService;
        this.logger = logger;
        this.display = display;
    }

    async run(diagnostic: CodeAnalyzerDiagnostic, document: vscode.TextDocument): Promise<void> {
        const startTime: number = Date.now();
        try {
            if (!this.unifiedDiffService.verifyCanShowDiff(document)) {
                this.telemetryService.sendCommandEvent(Constants.TELEM_QF_NO_FIX_SUGGESTED, {
                    commandSource: this.getCommandSource(),
                    reason: NO_FIX_REASON.UNIFIED_DIFF_CANNOT_BE_SHOWN
                });
                return;
            }

            const fixSuggestion: FixSuggestion = await this.suggestFix(diagnostic, document);
            if (!fixSuggestion) {
                this.display.displayInfo(messages.fixer.noFixSuggested);
                this.telemetryService.sendCommandEvent(Constants.TELEM_QF_NO_FIX_SUGGESTED, {
                    commandSource: this.getCommandSource(),
                    languageType: document.languageId,
                    reason: NO_FIX_REASON.EMPTY
                });
                return;
            }

            const originalCode: string = fixSuggestion.getOriginalCodeToBeFixed();
            const fixedCode: string = fixSuggestion.getFixedCode();
            if (originalCode === fixedCode) {
                this.display.displayInfo(messages.fixer.noFixSuggested);
                this.telemetryService.sendCommandEvent(Constants.TELEM_QF_NO_FIX_SUGGESTED, {
                    commandSource: this.getCommandSource(),
                    languageType: document.languageId,
                    reason: NO_FIX_REASON.SAME_CODE
                });
                return;
            }
            this.logger.debug(`Fix Diff:\n` +
                `=== ORIGINAL CODE ===:\n${originalCode}\n\n` +
                `=== FIXED CODE ===:\n${fixedCode}`);

            await this.displayDiffFor(fixSuggestion);

            if (fixSuggestion.hasExplanation()) {
                this.display.displayInfo(messages.fixer.explanationOfFix(fixSuggestion.getExplanation()));
            }
        } catch (err) {
            this.handleError(err, this.getFixSuggestionFailedTelemEventName(), Date.now() - startTime);
            return;
        }
    }

    private async displayDiffFor(codeFixSuggestion: FixSuggestion): Promise<void> {
        const diagnostic: CodeAnalyzerDiagnostic = codeFixSuggestion.codeFixData.diagnostic as CodeAnalyzerDiagnostic;
        const document: vscode.TextDocument = codeFixSuggestion.codeFixData.document;
        const suggestedNewDocumentCode: string = codeFixSuggestion.getFixedDocumentCode();
        const numLinesInFix: number = codeFixSuggestion.getFixedCodeLines().length;

        const acceptCallback: ()=>Promise<void> = (): Promise<void> => {
            this.telemetryService.sendCommandEvent(this.getFixAcceptedTelemEventName(), {
                commandSource: this.getCommandSource(),
                completionNumLines: numLinesInFix.toString(),
                languageType: document.languageId,
                engineName: diagnostic.violation.engine,
                ruleName: diagnostic.violation.rule
            });
            return Promise.resolve();
        };

        const rejectCallback: ()=>Promise<void> = (): Promise<void> => {
            this.diagnosticManager.addDiagnostics([diagnostic]); // Put back the diagnostic
            this.telemetryService.sendCommandEvent(this.getFixRejectedTelemEventName(), {
                commandSource: this.getCommandSource(),
                completionNumLines: numLinesInFix.toString(),
                languageType: document.languageId,
                engineName: diagnostic.violation.engine,
                ruleName: diagnostic.violation.rule
            });
            return Promise.resolve();
        };

        this.diagnosticManager.clearDiagnostic(diagnostic);
        try {
            await this.unifiedDiffService.showDiff(document, suggestedNewDocumentCode, acceptCallback, rejectCallback);
        } catch (err) {
            this.diagnosticManager.addDiagnostics([diagnostic]); // Put back the diagnostic
            throw err;
        }

        this.telemetryService.sendCommandEvent(this.getFixSuggestedTelemEventName(), {
            commandSource: this.getCommandSource(),
            completionNumLines: numLinesInFix.toString(),
            languageType: document.languageId,
            engineName: diagnostic.violation.engine,
            ruleName: diagnostic.violation.rule
        });
    }

    private handleError(err: unknown, errCategory: string, duration: number): void {
        this.display.displayError(getErrorMessage(err));
        this.telemetryService.sendException(errCategory, getErrorMessageWithStack(err), {
            executedCommand: this.getCommandSource(),
            duration: duration.toString()
        });
    }
}