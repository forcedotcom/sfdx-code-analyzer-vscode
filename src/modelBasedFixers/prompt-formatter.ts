/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

export class PromptBuilder {
    private static readonly VIOLATION_CODE_HOLE = '{{###VIOLATION_CODE###}}';
    private static readonly VIOLATION_MESSAGE_HOLE = '{{###VIOLATION_MESSAGE###}}'
    private static readonly ADDITIONAL_PROMPT_HOLE = '{{###ADDITIONAL_PROMPT###}}';
    private template: string;
    private substitutions: Map<string, string> = new Map();

    constructor(template: string) {
        this.template = template;
    }

    withViolationCode(userCode: string): PromptBuilder {
        this.substitutions.set(PromptBuilder.VIOLATION_CODE_HOLE, userCode);
        return this;
    }

    withViolationMessage(violationMsg: string): PromptBuilder {
        this.substitutions.set(PromptBuilder.VIOLATION_MESSAGE_HOLE, violationMsg);
        return this;
    }

    withAdditionalPrompt(additionalPrompt: string): PromptBuilder {
        this.substitutions.set(PromptBuilder.ADDITIONAL_PROMPT_HOLE, additionalPrompt);
        return this;
    }

    build(): string {
        let finalPrompt = this.template;
        for (const [key, value] of this.substitutions) {
            finalPrompt = finalPrompt.replace(key, value);
        }
        return finalPrompt;
    }
}