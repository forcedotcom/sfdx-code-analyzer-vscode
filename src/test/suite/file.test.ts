/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {expect} from 'chai';
import path = require('path');
import {exists, isDir} from '../../lib/file';

suite('file.ts', () => {
    const codeFixturesPath: string = path.resolve(__dirname, '..', '..', '..', 'code-fixtures');

    suite('#exists()', () => {
        
        test('Returns true when file exists.', async () => {
         expect(await exists(path.join(codeFixturesPath, 'folder-a', 'MyClassA1.cls'))).to.be.true;
        });

        test('Returns true when file exists.', async () => {
            expect(await exists(path.join(codeFixturesPath, 'folder-a', 'UnknownFile.cls'))).to.be.false;
        });
    });

    suite('#isDir()', () => {
        
        test('Returns true when dir exists.', async () => {
         expect(await isDir(path.join(codeFixturesPath, 'folder-a'))).to.be.true;
        });

        test('Returns true when dir not exists.', async () => {
            expect(await isDir(path.join(codeFixturesPath, 'unknown-folder-a'))).to.be.false;
        });

        test('Returns false for a file.', async () => {
            expect(await isDir(path.join(codeFixturesPath, 'folder-a', 'MyClassA1.cls'))).to.be.false;
        });
    });
});