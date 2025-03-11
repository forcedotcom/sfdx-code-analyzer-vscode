import * as vscode from "vscode";
import {messages} from "../messages";
import * as Constants from "../constants";
import {LLMServiceProvider} from "../external-services/llm-service";
import {Logger} from "../logger";
import {extractRuleName} from "../diagnostics";
import {A4D_SUPPORTED_RULES} from "./supported-rules";

/**
 * Provides the A4D "Quick Fix" button on the diagnostics associated with SFCA violations for the rules we have trained the LLM on.
 */
export class AgentforceCodeActionProvider implements vscode.CodeActionProvider {
    // This static property serves as CodeActionProviderMetadata to help aide VS Code to know when to call this provider
    static readonly providedCodeActionKinds: vscode.CodeActionKind[] = [vscode.CodeActionKind.QuickFix];

    private readonly llmServiceProvider: LLMServiceProvider;
    private readonly logger: Logger;
    private hasWarnedAboutUnavailableLLMService: boolean = false;

    constructor(llmServiceProvider: LLMServiceProvider, logger: Logger) {
        this.llmServiceProvider = llmServiceProvider;
        this.logger = logger;
    }

    async provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext,
                             _token: vscode.CancellationToken): Promise<vscode.CodeAction[]> {

        const codeActions: vscode.CodeAction[] = [];

        // Throw out diagnostics that aren't ours, or are for the wrong line.
        const filteredDiagnostics: vscode.Diagnostic[] = context.diagnostics.filter((diagnostic: vscode.Diagnostic) =>
            diagnostic.source
            && diagnostic.source.endsWith(messages.diagnostics.source.suffix)
            && range.contains(diagnostic.range)
            && A4D_SUPPORTED_RULES.has(extractRuleName(diagnostic)));

        if (filteredDiagnostics.length == 0) {
            return codeActions;
        }

        // Do not provide quick fix code actions if LLM service is not available. We warn once to let user know.
        if (!(await this.llmServiceProvider.isLLMServiceAvailable())) {
            if (!this.hasWarnedAboutUnavailableLLMService) {
                this.logger.warn(messages.agentforce.a4dQuickFixUnavailable);
                this.hasWarnedAboutUnavailableLLMService = true;
            }
            return codeActions;
        }

        for (const diagnostic of filteredDiagnostics) {
            const fixAction: vscode.CodeAction = new vscode.CodeAction(
                messages.agentforce.fixViolationWithA4D(extractRuleName(diagnostic)),
                vscode.CodeActionKind.QuickFix
            );
            fixAction.diagnostics = [diagnostic] // Important: this ties the code fix action to the specific diagnostic.
            fixAction.command = {
                title: 'Fix Diagnostic Issue', // Doesn't actually show up anywhere
                command: Constants.QF_COMMAND_A4D_FIX,
                arguments: [document, diagnostic] // The arguments passed to the run function of the AgentforceViolationFixAction
            };
            codeActions.push(fixAction);
        }

        return codeActions;
    }
}
