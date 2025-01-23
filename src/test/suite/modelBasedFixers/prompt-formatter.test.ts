/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */


import { expect } from 'chai';
import { PromptFormatter } from '../../../modelBasedFixers/prompt-formatter';

suite('PromptFormatter', () => {
  suite('constructor', () => {
    test('should initialize with a template string', () => {
      const template = 'Hello %s';
      const formatter = new PromptFormatter(template);
      expect(formatter['template']).to.equal(template);
    });
  });

  suite('substitute', () => {
    test('should replace a single %s placeholder', () => {
      const template = 'Hello %s';
      const formatter = new PromptFormatter(template);
      const result = formatter.substitute('World');
      expect(result).to.equal('Hello World');
    });

    test('should replace multiple %s placeholders in order', () => {
      const template = '%s World %s!';
      const formatter = new PromptFormatter(template);
      const result = formatter.substitute('Hello', 'all');
      expect(result).to.equal('Hello World all!');
    });

    test('should handle empty template', () => {
      const template = '';
      const formatter = new PromptFormatter(template);
      const result = formatter.substitute('test');
      expect(result).to.equal('');
    });

    test('should handle no replacements if no %s in template', () => {
      const template = 'No placeholders';
      const formatter = new PromptFormatter(template);
      const result = formatter.substitute('test');
      expect(result).to.equal('No placeholders');
    });

    test('should handle multiple substitutions with extra values', () => {
      const template = '%s %s %s';
      const formatter = new PromptFormatter(template);
      const result = formatter.substitute('One', 'Two', 'Three', 'Four');
      expect(result).to.equal('One Two Three');
    });
  });
});