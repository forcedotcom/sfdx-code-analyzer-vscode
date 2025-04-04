/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import {makePrompt, GUIDED_JSON_SCHEMA, LLMResponse, PromptInputs} from './llm-prompt';
import {LLMService, LLMServiceProvider} from "../external-services/llm-service";
import {Logger} from "../logger";
import {A4D_SUPPORTED_RULES, RuleInfo, ViolationContextScope} from "./supported-rules";
import {RangeExpander} from "../range-expander";
import {FixSuggestion} from "../fix-suggestion";
import {messages} from "../messages";
import {getErrorMessage, getErrorMessageWithStack} from "../utils";
import {CodeAnalyzerDiagnostic} from "../diagnostics";

export class AgentforceViolationFixer {
    private readonly llmServiceProvider: LLMServiceProvider;
    private readonly logger: Logger;

    constructor(llmServiceProvider: LLMServiceProvider, logger: Logger) {
        this.llmServiceProvider = llmServiceProvider;
        this.logger = logger;
    }

    /**
     * Returns suggested replacement code for the entire document that should fix the violation associated with the diagnostic (using A4D).
     * @param document
     * @param diagnostic
     */
    async suggestFix(document: vscode.TextDocument, diagnostic: CodeAnalyzerDiagnostic): Promise<FixSuggestion | null> {
        try {
            const llmService: LLMService = await this.llmServiceProvider.getLLMService();

            const ruleName: string = diagnostic.violation.rule;
            const ruleInfo: RuleInfo = A4D_SUPPORTED_RULES.get(ruleName);
            if (!ruleInfo) {
                // Should never get called since suggestFix should only be called on supported rules
                throw new Error(`Unsupported rule: ${ruleName}`);
            }

            const rangeExpander: RangeExpander = new RangeExpander(document);
            const violationLinesRange: vscode.Range = rangeExpander.expandToCompleteLines(diagnostic.range);
            let contextRange: vscode.Range = violationLinesRange; // This is the default: ViolationContextScope.ViolationScope
            if (ruleInfo.violationContextScope === ViolationContextScope.ClassScope) {
                contextRange = rangeExpander.expandToClass(diagnostic.range);
            } else if (ruleInfo.violationContextScope === ViolationContextScope.MethodScope) {
                contextRange = rangeExpander.expandToMethod(diagnostic.range);
            }

            const promptInputs: PromptInputs = {
                codeContext: document.getText(contextRange),
                violatingLines: document.getText(violationLinesRange),
                violationMessage: diagnostic.message,
                ruleName: ruleName,
                ruleDescription: ruleInfo.description
            };
            const prompt: string = makePrompt(promptInputs);

            // Call the LLM service with the generated prompt
            this.logger.trace('Sending prompt to LLM:\n' + prompt);
            const llmResponseText: string = await llmService.callLLM(prompt, GUIDED_JSON_SCHEMA);
            let llmResponse: LLMResponse;
            try {
                llmResponse = JSON.parse(llmResponseText) as LLMResponse;
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

        } catch (error) {
            void vscode.window.showErrorMessage(`${messages.agentforce.failedA4DResponse}\n${getErrorMessage(error)}`);
            this.logger.error(`${messages.agentforce.failedA4DResponse}\n${getErrorMessageWithStack(error)}`);
            return null;
        }
    }
}
