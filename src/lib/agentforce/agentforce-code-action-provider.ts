import * as vscode from "vscode";
import {messages} from "../messages";
import * as Constants from "../constants";
import {LLMServiceProvider} from "../external-services/llm-service";
import {Logger} from "../logger";
import {CodeAnalyzerDiagnostic} from "../diagnostics";
import {A4D_SUPPORTED_RULES, ViolationContextScope} from "./supported-rules";

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
        const filteredDiagnostics: CodeAnalyzerDiagnostic[] = context.diagnostics
            .filter(d => d instanceof CodeAnalyzerDiagnostic)
            .filter(d => !d.isStale())
            // Technically, I don't think VS Code sends in diagnostics that aren't overlapping with the users selection,
            // but just in case they do, then this last filter is an additional sanity check just to be safe
            .filter(d => range.intersection(d.range) != undefined);

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


            let scope: ViolationContextScope | undefined = undefined;
            if (A4D_SUPPORTED_RULES.has(diagnostic.violation.rule)) {
                scope = A4D_SUPPORTED_RULES.get(diagnostic.violation.rule);
            }

            
            if (scope === undefined || scope === ViolationContextScope.ViolationScope) {
                const fixAction1: vscode.CodeAction = new vscode.CodeAction(
                    messages.agentforce.fixViolationWithA4D(diagnostic.violation.rule) + " (Violation Scope)",
                    vscode.CodeActionKind.QuickFix
                );
                fixAction1.diagnostics = [diagnostic] // Important: this ties the code fix action to the specific diagnostic.
                fixAction1.command = {
                    title: 'Fix Diagnostic Issue', // Doesn't actually show up anywhere
                    command: Constants.QF_COMMAND_A4D_FIX + "1",
                    arguments: [document, diagnostic] // The arguments passed to the run function of the AgentforceViolationFixAction
                };
                codeActions.push(fixAction1);
            }



            if (scope === undefined || scope === ViolationContextScope.MethodScope) {
                const fixAction2: vscode.CodeAction = new vscode.CodeAction(
                messages.agentforce.fixViolationWithA4D(diagnostic.violation.rule) + " (Method Scope)",
                vscode.CodeActionKind.QuickFix
                );
                fixAction2.diagnostics = [diagnostic] // Important: this ties the code fix action to the specific diagnostic.
                fixAction2.command = {
                    title: 'Fix Diagnostic Issue', // Doesn't actually show up anywhere
                    command: Constants.QF_COMMAND_A4D_FIX + "2",
                    arguments: [document, diagnostic] // The arguments passed to the run function of the AgentforceViolationFixAction
                };
                codeActions.push(fixAction2);
            }


            if (scope === undefined || scope === ViolationContextScope.ClassScope) {
                const fixAction3: vscode.CodeAction = new vscode.CodeAction(
                messages.agentforce.fixViolationWithA4D(diagnostic.violation.rule) + " (Class Scope)",
                vscode.CodeActionKind.QuickFix
                );
                fixAction3.diagnostics = [diagnostic] // Important: this ties the code fix action to the specific diagnostic.
                fixAction3.command = {
                    title: 'Fix Diagnostic Issue', // Doesn't actually show up anywhere
                    command: Constants.QF_COMMAND_A4D_FIX + "3",
                    arguments: [document, diagnostic] // The arguments passed to the run function of the AgentforceViolationFixAction
                };
                codeActions.push(fixAction3);
            }
        }

        return codeActions;
    }
}
