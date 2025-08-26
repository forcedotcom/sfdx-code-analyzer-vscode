import * as vscode from "vscode";
import {messages} from "../messages";
import {LLMServiceProvider} from "../external-services/llm-service";
import {Logger} from "../logger";
import {CodeAnalyzerDiagnostic} from "../diagnostics";
import { A4DFixAction } from "./a4d-fix-action";

/**
 * Provides the A4D "Quick Fix" button on the diagnostics associated with SFCA violations for the rules we have trained the LLM on.
 */
export class A4DFixActionProvider implements vscode.CodeActionProvider {
    // This static property serves as CodeActionProviderMetadata to help aide VS Code to know when to call this provider
    static readonly providedCodeActionKinds: vscode.CodeActionKind[] = [vscode.CodeActionKind.QuickFix];

    private readonly llmServiceProvider: LLMServiceProvider;
    private readonly logger: Logger;
    private hasWarnedAboutUnavailableLLMService: boolean = false;

    constructor(llmServiceProvider: LLMServiceProvider, logger: Logger) {
        this.llmServiceProvider = llmServiceProvider;
        this.logger = logger;
    }

    async provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): Promise<vscode.CodeAction[]> {
        const filteredDiagnostics: CodeAnalyzerDiagnostic[] = context.diagnostics
            .filter(d => d instanceof CodeAnalyzerDiagnostic)
            .filter(d => A4DFixAction.isRelevantDiagnostic(d))
            // Technically, I don't think VS Code sends in diagnostics that aren't overlapping with the users selection,
            // but just in case they do, then this last filter is an additional sanity check just to be safe
            .filter(d => range.intersection(d.range) != undefined);

        if (filteredDiagnostics.length == 0) {
            return [];
        }

        // Do not provide quick fix code actions if LLM service is not available. We warn once to let user know.
        if (!(await this.llmServiceProvider.isLLMServiceAvailable())) {
            if (!this.hasWarnedAboutUnavailableLLMService) {
                this.logger.warn(messages.agentforce.a4dQuickFixUnavailable);
                this.hasWarnedAboutUnavailableLLMService = true;
            }
            return [];
        }

        return filteredDiagnostics.map(diag => createCodeAction(diag, document));
    }
}

function createCodeAction(diag: CodeAnalyzerDiagnostic, document: vscode.TextDocument): vscode.CodeAction {
    const fixMsg: string = messages.fixer.applyFix(diag.violation.engine, diag.violation.rule);
    const action = new vscode.CodeAction(fixMsg, vscode.CodeActionKind.QuickFix);
    action.diagnostics = [diag]; // Important: this ties the code fix action to the specific diagnostic.
    action.command = {
        title: fixMsg, // Doesn't seem to actually show up anywhere, so just reusing the fix msg
        command: A4DFixAction.COMMAND,
        arguments: [diag, document]
    }
    return action;
}