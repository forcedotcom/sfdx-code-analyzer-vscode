import * as vscode from "vscode";
import * as Constants from "./constants"
import {TelemetryService} from "./external-services/telemetry-service";
import {UnifiedDiffService} from "./unified-diff-service";
import {Logger} from "./logger";
import {CodeAnalyzerDiagnostic, DiagnosticManager, Fix, toRange} from "./diagnostics";
import {CodeFixData, FixSuggestion} from "./fix-suggestion";
import {Display} from "./display";
import { SuggestFixWithDiffAction } from "./suggest-fix-with-diff-action";

export class ApplyViolationFixesAction extends SuggestFixWithDiffAction {
    static readonly COMMAND: string = Constants.QF_COMMAND_APPLY_VIOLATION_FIXES;

    static isRelevantDiagnostic(diagnostic: CodeAnalyzerDiagnostic, document: vscode.TextDocument): boolean {
        return !diagnostic.isStale() && 
            diagnostic.violation.fixes?.length > 0 &&
            // Currently we only mark relevant the diagnostics with all its fixes corresponding to the document
            diagnostic.violation.fixes.every(f => f.location.file === document.fileName);
    }

    constructor(unifiedDiffService: UnifiedDiffService, diagnosticManager: DiagnosticManager,
                telemetryService: TelemetryService, logger: Logger, display: Display) {
        super(unifiedDiffService, diagnosticManager, telemetryService, logger, display)
    }

    getCommandSource(): string {
        return ApplyViolationFixesAction.COMMAND;
    }

    getFixSuggestedTelemEventName(): string {
        return Constants.TELEM_QF_FIX_SUGGESTED;
    }

    getFixSuggestionFailedTelemEventName(): string {
        return Constants.TELEM_QF_FIX_SUGGESTION_FAILED
    }

    getFixAcceptedTelemEventName(): string {
        return Constants.TELEM_QF_FIX_ACCEPTED;
    }

    getFixRejectedTelemEventName(): string {
        return Constants.TELEM_QF_FIX_REJECTED;
    }

    suggestFix(diagnostic: CodeAnalyzerDiagnostic, document: vscode.TextDocument): Promise<FixSuggestion | null> {
        if (!ApplyViolationFixesAction.isRelevantDiagnostic(diagnostic, document)) {
            // This line should theoretically should not be possible to hit because this filter is already provided in 
            // the ApplyViolationFixesActionProvider, but it is here as a sanity check
            return Promise.resolve(null)
        }
        
        const consolidatedFix: Fix = diagnostic.violation.fixes.length > 1 ? 
            consolidateFixes(diagnostic.violation.fixes, document) : diagnostic.violation.fixes[0];

        const codeFixData: CodeFixData = {
            document: document,
            diagnostic: diagnostic,
            rangeToBeFixed: toRange(consolidatedFix.location),
            fixedCode: consolidatedFix.fixedCode
        }
        return Promise.resolve(new FixSuggestion(codeFixData));
    }
}


function consolidateFixes(_fixes: Fix[], _document: vscode.TextDocument): Fix {
    // TODO: W-19264999 (Not needed until either ApexGuru returns multiple Fixes per violation or we add in engines that do)
    throw new Error('Support for consolidating multiple fixes into a single fix has not been implemented yet.');
}