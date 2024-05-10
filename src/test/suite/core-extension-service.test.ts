/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {expect} from 'chai';
import path = require('path');
import {CoreExtensionService} from '../../lib/core-extension-service';

suite('core-extension-service.ts', () => {

    suite('isAboveMinimumRequiredVersion()', () => {
        test('returns true when actual version is higher than min version', () => {
            expect(CoreExtensionService.isAboveMinimumRequiredVersion('1.0.0', '1.0.2')).to.equal(true);
        });

        test('returns true when actual is less than min version', () => {
            expect(CoreExtensionService.isAboveMinimumRequiredVersion('1.0.0', '0.0.9')).to.equal(false);
        });

        test('returns true when actual and min versions are equal', () => {
            expect(CoreExtensionService.isAboveMinimumRequiredVersion('1.0.0', '1.0.1')).to.equal(true);
        });
    });
});