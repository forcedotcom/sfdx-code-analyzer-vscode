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
import {extractRuleName} from "../diagnostics";
import {A4D_SUPPORTED_RULES} from "./supported-rules";
import {RangeExpander} from "../range-expander";
import {FixSuggestion} from "../fix-suggestion";
import {messages} from "../messages";
import {getErrorMessage, getErrorMessageWithStack} from "../utils";

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
    async suggestFix(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): Promise<FixSuggestion | null> {
        try {
            const llmService: LLMService = await this.llmServiceProvider.getLLMService();

            const rangeExpander: RangeExpander = new RangeExpander();

            const violationLinesRange: vscode.Range = rangeExpander.expandToCompleteLines(document, diagnostic.range);

            // NOTE: We currently assume that the range of the context of the code to replace is equal to the range of
            //       the violating lines. This won't work for the rules that need additional context, so we have a
            //       TODO to update the context with W-17617362.
            const contextRange: vscode.Range = violationLinesRange;

            // Generate the prompt
            const ruleName: string = extractRuleName(diagnostic);
            const promptInputs: PromptInputs = {
                codeContext: document.getText(contextRange),
                violatingLines: document.getText(violationLinesRange),
                violationMessage: diagnostic.message,
                ruleName: ruleName,
                ruleDescription: A4D_SUPPORTED_RULES.get(ruleName)
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
