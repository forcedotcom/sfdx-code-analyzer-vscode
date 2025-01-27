/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */


import { expect } from 'chai';
import { PromptBuilder } from '../../../modelBasedFixers/prompt-formatter';

suite('PromptFormatter', () => {
  const baseTemplate = `
Fix the code:
{{###VIOLATION_CODE###}}

Violation: {{###VIOLATION_MESSAGE###}}

Additional Notes: {{###ADDITIONAL_PROMPT###}}
`;

  test('replaces violation code placeholder', () => {
      const formatter = new PromptBuilder(baseTemplate);
      const result = formatter
          .withViolationCode('class Test {}')
          .build();
      
      expect(result).to.include('class Test {}');
      expect(result).to.not.include('{{###VIOLATION_CODE###}}');
  });

  test('replaces violation message placeholder', () => {
      const formatter = new PromptBuilder(baseTemplate);
      const result = formatter
          .withViolationMessage('Code style violation')
          .build();
      
      expect(result).to.include('Code style violation');
      expect(result).to.not.include('{{###VIOLATION_MESSAGE###}}');
  });

  test('replaces additional prompt placeholder', () => {
      const formatter = new PromptBuilder(baseTemplate);
      const result = formatter
          .withAdditionalPrompt('Improve readability')
          .build();
      
      expect(result).to.include('Improve readability');
      expect(result).to.not.include('{{###ADDITIONAL_PROMPT###}}');
  });

  test('supports chaining multiple replacements', () => {
      const formatter = new PromptBuilder(baseTemplate);
      const result = formatter
          .withViolationCode('class Test {}')
          .withViolationMessage('Code style violation')
          .withAdditionalPrompt('Improve readability')
          .build();
      
      expect(result).to.include('class Test {}');
      expect(result).to.include('Code style violation');
      expect(result).to.include('Improve readability');
      expect(result).to.not.include('{{###VIOLATION_CODE###}}');
      expect(result).to.not.include('{{###VIOLATION_MESSAGE###}}');
      expect(result).to.not.include('{{###ADDITIONAL_PROMPT###}}');
  });

  test('handles partial replacements', () => {
      const formatter = new PromptBuilder(baseTemplate);
      const result = formatter
          .withViolationCode('class Test {}')
          .build();
      
      expect(result).to.include('class Test {}');
      expect(result).to.include('{{###VIOLATION_MESSAGE###}}');
      expect(result).to.include('{{###ADDITIONAL_PROMPT###}}');
  });
});