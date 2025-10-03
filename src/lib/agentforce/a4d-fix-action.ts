import * as vscode from "vscode";
import * as Constants from "../constants";
import {makePrompt, GUIDED_JSON_SCHEMA, LLMResponse, PromptInputs} from './llm-prompt';
import {TelemetryService} from "../external-services/telemetry-service";
import {UnifiedDiffService} from "../unified-diff-service";
import {Logger} from "../logger";
import {CodeAnalyzerDiagnostic, DiagnosticManager} from "../diagnostics";
import {FixSuggestion} from "../fix-suggestion";
import {RangeExpander} from "../range-expander";
import {Display} from "../display";
import {messages} from '../messages';
import {SuggestFixWithDiffAction} from "../suggest-fix-with-diff-action";
import {LLMService, LLMServiceProvider} from "../external-services/llm-service";
import {CodeAnalyzer} from "../code-analyzer";
import {A4D_SUPPORTED_RULES, ViolationContextScope} from "./supported-rules";
import {getErrorMessage} from "../utils";

export class A4DFixAction extends SuggestFixWithDiffAction {
    static readonly COMMAND: string = Constants.QF_COMMAND_A4D_FIX;

    static isRelevantDiagnostic(diagnostic: CodeAnalyzerDiagnostic): boolean {
        return !diagnostic.isStale() && A4D_SUPPORTED_RULES.has(diagnostic.violation.rule);
    }

    private readonly llmServiceProvider: LLMServiceProvider;
    private readonly codeAnalyzer: CodeAnalyzer;

    constructor(llmServiceProvider: LLMServiceProvider, codeAnalyzer: CodeAnalyzer, unifiedDiffService: UnifiedDiffService, diagnosticManager: DiagnosticManager,
                telemetryService: TelemetryService, logger: Logger, display: Display) {
        super(unifiedDiffService, diagnosticManager, telemetryService, logger, display);
        this.llmServiceProvider = llmServiceProvider;
        this.codeAnalyzer = codeAnalyzer;
    }

    getCommandSource(): string {
        return A4DFixAction.COMMAND;
    }

    getFixSuggestedTelemEventName(): string {
        return Constants.TELEM_A4D_SUGGESTION;
    }

    getFixAcceptedTelemEventName(): string {
        return Constants.TELEM_A4D_ACCEPT;
    }

    getFixRejectedTelemEventName(): string {
        return Constants.TELEM_A4D_REJECT;
    }

    getFixSuggestionFailedTelemEventName(): string {
        return Constants.TELEM_A4D_SUGGESTION_FAILED;
    }

    /**
     * Robustly parses JSON from LLM response text that may contain extra formatting or text.
     * Handles common cases like:
     * - Markdown code blocks (```json ... ```)
     * - Extra text before or after the JSON
     * - Malformed responses with partial text
     * @param responseText The raw response text from the LLM
     * @returns Parsed JSON object
     * @throws Error if no valid JSON can be extracted
     */
    private parseRobustJSON(responseText: string): LLMResponse {
        // First, try parsing the response as-is
        try {
            return JSON.parse(responseText) as LLMResponse;
        } catch {
            // If that fails, try to extract JSON from the response
        }

        // Remove leading/trailing whitespace
        const cleanedText = responseText.trim();

        // Try to extract JSON from markdown code blocks
        const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i;
        const codeBlockMatch = cleanedText.match(codeBlockRegex);
        if (codeBlockMatch) {
            try {
                return JSON.parse(codeBlockMatch[1]) as LLMResponse;
            } catch {
                // Continue to other methods if this fails
            }
        }

        // Try to find JSON object boundaries in the text
        const jsonStartIndex = cleanedText.indexOf('{');
        const jsonEndIndex = cleanedText.lastIndexOf('}');
        
        if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
            const potentialJson = cleanedText.substring(jsonStartIndex, jsonEndIndex + 1);
            try {
                return JSON.parse(potentialJson) as LLMResponse;
            } catch {
                // Continue to other methods if this fails
            }
        }

        // Try to extract JSON using a more flexible regex that handles nested objects
        const jsonRegex = /\{(?:[^{}]|{[^{}]*})*\}/;
        const jsonMatch = cleanedText.match(jsonRegex);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]) as LLMResponse;
            } catch {
                // Continue if this fails
            }
        }

        // If all else fails, try to clean up common issues and parse again
        // Remove any leading non-JSON text
        const lines = cleanedText.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('{')) {
                const remainingText = lines.slice(i).join('\n');
                const endBraceIndex = remainingText.lastIndexOf('}');
                if (endBraceIndex !== -1) {
                    const jsonCandidate = remainingText.substring(0, endBraceIndex + 1);
                    try {
                        return JSON.parse(jsonCandidate) as LLMResponse;
                    } catch {
                        // Continue if this fails
                    }
                }
            }
        }

        // Final attempt: try to fix common JSON issues
        try {
            // Remove any trailing text after the last }
            const lastBraceIndex = cleanedText.lastIndexOf('}');
            if (lastBraceIndex !== -1) {
                let jsonCandidate = cleanedText.substring(0, lastBraceIndex + 1);
                
                // Find the first { and use everything from there
                const firstBraceIndex = jsonCandidate.indexOf('{');
                if (firstBraceIndex !== -1) {
                    jsonCandidate = jsonCandidate.substring(firstBraceIndex);
                    return JSON.parse(jsonCandidate) as LLMResponse;
                }
            }
        } catch {
            // If this also fails, we'll throw the error below
        }

        throw new Error(`Unable to extract valid JSON from response: ${responseText.substring(0, 200)}...`);
    }

    /**
     * Returns suggested replacement code for the entire document that should fix the violation associated with the diagnostic (using A4D).
     * @param document
     * @param diagnostic
     */
    async suggestFix(diagnostic: CodeAnalyzerDiagnostic, document: vscode.TextDocument): Promise<FixSuggestion | null> {
        if (!A4DFixAction.isRelevantDiagnostic(diagnostic)) {
            // This line should theoretically should not be possible to hit because this filter is already used as a
            // filter in  the A4DFixActionProvider, but it is here as a sanity check.
            return null;
        }

        const llmService: LLMService = await this.llmServiceProvider.getLLMService();

        const engineName: string = diagnostic.violation.engine;
        const ruleName: string = diagnostic.violation.rule;

        const ruleDescription: string = await this.codeAnalyzer.getRuleDescriptionFor(engineName, ruleName);

        const violationContextScope: ViolationContextScope = A4D_SUPPORTED_RULES.get(ruleName);

        const rangeExpander: RangeExpander = new RangeExpander(document);
        const violationLinesRange: vscode.Range = rangeExpander.expandToCompleteLines(diagnostic.range);
        let contextRange: vscode.Range = violationLinesRange; // This is the default: ViolationContextScope.ViolationScope
        if (violationContextScope === ViolationContextScope.ClassScope) {
            contextRange = rangeExpander.expandToClass(diagnostic.range);
        } else if (violationContextScope === ViolationContextScope.MethodScope) {
            contextRange = rangeExpander.expandToMethod(diagnostic.range);
        }

        const promptInputs: PromptInputs = {
            codeContext: document.getText(contextRange),
            violatingLines: document.getText(violationLinesRange),
            violationMessage: diagnostic.message,
            ruleName: ruleName,
            ruleDescription: ruleDescription
        };
        const prompt: string = makePrompt(promptInputs);

        // Call the LLM service with the generated prompt
        this.logger.trace('Sending prompt to LLM:\n' + prompt);
        let llmResponseText: string;
        try {
            llmResponseText = await llmService.callLLM(prompt, GUIDED_JSON_SCHEMA);
        } catch (error) {
            throw new Error(`${messages.agentforce.failedA4DResponse}\n${getErrorMessage(error)}`)
        }

        let llmResponse: LLMResponse;
        try {
            llmResponse = this.parseRobustJSON(llmResponseText);
        } catch (error) {
            throw new Error(`Response from LLM is not valid JSON: ${getErrorMessage(error)}`);
        }

        if (llmResponse.fixedCode === undefined) {
            throw new Error(`Response from LLM is missing the 'fixedCode' property.`);
        }

        this.logger.trace('Received response from LLM:\n' + JSON.stringify(llmResponse, undefined, 2));

        // TODO: convert the contextRange and the fixedCode into a more narrow CodeFixData that doesn't include
        // leading and trailing lines that are common to the original lines.
        return new FixSuggestion({
            document: document,
            diagnostic: diagnostic,
            rangeToBeFixed: contextRange,
            fixedCode: llmResponse.fixedCode
        }, llmResponse.explanation);
    }
}
