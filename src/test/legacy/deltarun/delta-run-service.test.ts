/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {expect} from 'chai';
import * as Sinon from 'sinon';
import proxyquire from 'proxyquire';

suite('Delta Run Test Suite', () => {
  suite('#getDeltaRunTarget', () => {
    let readFileSyncStub: Sinon.SinonStub;
    let getDeltaRunTarget: (sfgecachepath: string, savedFilesCache :Set<string>) => void;
   
    // Set up stubs and mock the fs module
    setup(() => {
      readFileSyncStub = Sinon.stub();
  
      // Load the module with the mocked fs dependency
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const mockedModule = proxyquire('../../../deltarun/delta-run-service', {
        fs: {
          readFileSync: readFileSyncStub
        }
      });
  
      // Get the function from the module
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      getDeltaRunTarget = mockedModule.getDeltaRunTarget;
    });
  
    teardown(() => {
      Sinon.restore();
    });
  
    test('Returns matching entries when files in cache match JSON data', () => {
      // Setup the mock return value for readFileSync
      const sfgecachepath = '/path/to/sfgecache.json';
      const savedFilesCache = new Set<string>([
        '/some/user/path/HelloWorld.cls'
      ]);
  
      const jsonData = `{
        "data": [
          {
            "entries": ["/some/user/path/HelloWorld.cls#getProducts", "/some/user/path/HelloWorld.cls#getSimilarProducts"],
            "filename": "/some/user/path/HelloWorld.cls"
          }
        ]
      }`;
  
      readFileSyncStub.withArgs(sfgecachepath, 'utf-8').returns(jsonData);
  
      // Test
      const result = getDeltaRunTarget(sfgecachepath, savedFilesCache);
  
      // Assertions
      expect(result).to.deep.equal([
        '/some/user/path/HelloWorld.cls#getProducts',
        '/some/user/path/HelloWorld.cls#getSimilarProducts'
      ]);
  
      Sinon.assert.calledOnce(readFileSyncStub);
    });

    test('Returns an empty array when no matching files are found in cache', () => {
      // ===== SETUP =====
      const sfgecachepath = '/path/to/sfgecache.json';
      const savedFilesCache = new Set<string>([
        '/some/user/path/HelloWorld.cls'
      ]);
  
      const jsonData = `{
        "data": [
          {
            "filename": "/some/user/path/NotHelloWorld.cls",
            "entries": ["/some/user/path/NotHelloWorld.cls#getProducts"]
          }
        ]
      }`;
  
      // Stub the file read to return the JSON data
      readFileSyncStub.withArgs(sfgecachepath, 'utf-8').returns(jsonData);
  
      // ===== TEST =====
      const result = getDeltaRunTarget(sfgecachepath, savedFilesCache);
  
      // ===== ASSERTIONS =====
      expect(result).to.deep.equal([]);
  
      Sinon.assert.calledOnce(readFileSyncStub);
    });
  });
});
