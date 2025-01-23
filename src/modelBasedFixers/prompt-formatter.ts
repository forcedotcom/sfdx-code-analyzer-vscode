/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

export class PromptFormatter {
  private template: string;

  constructor(template: string) {
    this.template = template;
  }

  substitute(...values: string[]): string {
    let result = this.template;
    values.forEach((value) => {
      result = result.replace("%s", value);
    });
    return result;
  }
}