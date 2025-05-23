/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {expect} from 'chai';
import * as path from 'path';
import {FileHandlerImpl} from '../../lib/fs-utils';

suite('file.ts', () => {
    // Note: Because this is a mocha test, __dirname here is actually the location of the js file in the out/test folder.
    const codeFixturesPath: string = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'code-fixtures');

    suite('#exists()', () => {

        test('Returns true when file exists.', async () => {
         expect(await (new FileHandlerImpl()).exists(path.join(codeFixturesPath, 'folder a', 'MyClassA1.cls'))).to.equal(true);
        });

        test('Returns false when file does not exists.', async () => {
            expect(await (new FileHandlerImpl()).exists(path.join(codeFixturesPath, 'folder a', 'UnknownFile.cls'))).to.equal(false);
        });
    });

    suite('#isDir()', () => {

        test('Returns true when path is dir.', async () => {
         expect(await (new FileHandlerImpl()).isDir(path.join(codeFixturesPath, 'folder a'))).to.equal(true);
        });

        test('Returns false when path is file.', async () => {
            expect(await (new FileHandlerImpl()).isDir(path.join(codeFixturesPath, 'folder a', 'MyClassA1.cls'))).to.equal(false);
        });
    });
});
