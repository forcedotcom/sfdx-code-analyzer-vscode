/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {expect} from 'chai';
import Sinon = require('sinon');
import {CoreExtensionService} from '../../../lib/core-extension-service';
import * as Constants from '../../../lib/constants';
import * as ApexGuruFunctions from '../../../apexguru/apex-guru-service'
import { RuleResult, ApexGuruViolation } from '../../../types';
import { Connection } from '../../../lib/core-extension-service';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

suite('Apex Guru Test Suite', () => {
    let outputChannel = vscode.window.createOutputChannel('Salesforce Code Analyzer', {log: true});

	  suite('#_isApexGuruEnabledInOrg', () => {
        let getConnectionStub: Sinon.SinonStub;
		    let requestStub: Sinon.SinonStub;
	  
        setup(() => {
          getConnectionStub = Sinon.stub(CoreExtensionService, 'getConnection');
          requestStub = Sinon.stub();
        });
	  
        teardown(() => {
          Sinon.restore();
        });
        
        test('Returns true if response status is Success', async () => {
            // ===== SETUP =====
            getConnectionStub.resolves({
            request: requestStub.resolves({ status: 'Success' })
            });
          
            // ===== TEST =====
            const result = await ApexGuruFunctions.isApexGuruEnabledInOrg(outputChannel);
          
            // ===== ASSERTIONS =====
            expect(result).to.be.true;
            Sinon.assert.calledOnce(getConnectionStub);
            Sinon.assert.calledOnce(requestStub);
            Sinon.assert.calledWith(requestStub, {
            method: 'GET',
            url: Constants.APEX_GURU_AUTH_ENDPOINT,
            body: ''
            });
        });
      
        test('Returns false if response status is not Success', async () => {
            // ===== SETUP =====
            getConnectionStub.resolves({
            request: requestStub.resolves({ status: 'Failure' })
            });
        
            // ===== TEST =====
            const result = await ApexGuruFunctions.isApexGuruEnabledInOrg(outputChannel);
        
            // ===== ASSERTIONS =====
            expect(result).to.be.false;
            Sinon.assert.calledOnce(getConnectionStub);
            Sinon.assert.calledOnce(requestStub);
            Sinon.assert.calledWith(requestStub, {
            method: 'GET',
            url: Constants.APEX_GURU_AUTH_ENDPOINT,
            body: ''
            });
          });
        
        test('Returns false if an error is thrown', async () => {
            // ===== SETUP =====
            getConnectionStub.resolves({
            request: requestStub.rejects(new Error('Resource not found'))
            });
        
            // ===== TEST =====
            const result = await ApexGuruFunctions.isApexGuruEnabledInOrg(outputChannel);
        
            // ===== ASSERTIONS =====
            expect(result).to.be.false;
            Sinon.assert.calledOnce(getConnectionStub);
            Sinon.assert.calledOnce(requestStub);
            Sinon.assert.calledWith(requestStub, {
            method: 'GET',
            url: Constants.APEX_GURU_AUTH_ENDPOINT,
            body: ''
          });
		  });
	  });
 
  suite('#initiateApexGuruRequest', () => {
        let getConnectionStub: Sinon.SinonStub;
        let requestStub: Sinon.SinonStub;
        let readFileStub: Sinon.SinonStub;
    
        setup(() => {
            getConnectionStub = Sinon.stub(CoreExtensionService, 'getConnection');
            requestStub = Sinon.stub();
            readFileStub = Sinon.stub(ApexGuruFunctions.fileSystem, 'readFile');
        });
    
        teardown(() => {
            Sinon.restore();
        });
    
        test('Returns requestId if response status is new', async () => {
            // ===== SETUP =====
            getConnectionStub.resolves({
                request: requestStub.resolves({ status: 'new', requestId: '12345' })
            });
            readFileStub.resolves('console.log("Hello World");');
            const connection = await CoreExtensionService.getConnection();
        
            // ===== TEST =====
            const result = await ApexGuruFunctions.initiateApexGuruRequest(vscode.Uri.file('dummyPath'), outputChannel, connection);
        
            // ===== ASSERTIONS =====
            expect(result).to.equal('12345');
            Sinon.assert.calledOnce(getConnectionStub);
            Sinon.assert.calledOnce(requestStub);
            Sinon.assert.calledOnce(readFileStub);
            Sinon.assert.calledWith(requestStub, Sinon.match({
                method: 'POST',
                url: Constants.APEX_GURU_REQUEST,
                body: Sinon.match.string
            }));
        });
    
        test('Logs warning if response status is not new', async () => {
            // ===== SETUP =====
            getConnectionStub.resolves({
                request: requestStub.resolves({ status: 'failed' })
            });
            readFileStub.resolves('console.log("Hello World");');
            const outputChannelSpy = Sinon.spy(outputChannel, 'warn');
            const connection = await CoreExtensionService.getConnection();
        
            // ===== TEST =====
            try {
              await ApexGuruFunctions.initiateApexGuruRequest(vscode.Uri.file('dummyPath'), outputChannel, connection);
            } catch (e) {
              // ===== ASSERTIONS =====
              Sinon.assert.calledOnce(outputChannelSpy);
              Sinon.assert.calledWith(outputChannelSpy, Sinon.match.string);
            }
        });
    });

    suite('#transformStringToRuleResult', () => {
      test('Transforms valid JSON string to RuleResult', () => {
          const fileName = 'TestFile.cls';
          const jsonString = JSON.stringify([{
              type: 'BestPractices',
              value: 'Avoid using System.debug',
              properties: [
                  { name: 'line_number', value: '10' },
                  { name: 'code_after', value: Buffer.from('System.out.println("Hello World");').toString('base64') }
              ]
          }]);

          const result: RuleResult = ApexGuruFunctions.transformStringToRuleResult(fileName, jsonString);

          expect(result).to.deep.equal({
              engine: 'apexguru',
              fileName: fileName,
              violations: [{
                  ruleName: 'BestPractices',
                  message: 'Avoid using System.debug',
                  severity: 1,
                  category: 'BestPractices',
                  line: 10,
                  column: 1,
                  suggestedCode: 'System.out.println("Hello World");'
              }]
          });
      });

      test('Handles empty JSON string', () => {
          const fileName = 'TestFile.cls';
          const jsonString = '';

          expect(() => ApexGuruFunctions.transformStringToRuleResult(fileName, jsonString)).to.throw();
      });
    });

    suite('#pollAndGetApexGuruResponse', () => {
        let connectionStub: Sinon.SinonStubbedInstance<Connection>;

        setup(() => {
            connectionStub = {
                instanceUrl: '',
                getApiVersion: Sinon.stub(),
                getUsername: Sinon.stub(),
                getAuthInfoFields: Sinon.stub(),
                request: Sinon.stub()
            } as Sinon.SinonStubbedInstance<Connection>;
        });

        teardown(() => {
            Sinon.restore();
        });

        test('Returns successfully on first request when status is success', async () => {
            const requestId = '12345';
            const queryResponse: ApexGuruFunctions.ApexGuruQueryResponse = { status: 'success' };

            connectionStub.request.resolves(queryResponse);

            const result = await ApexGuruFunctions.pollAndGetApexGuruResponse(connectionStub as Connection, requestId);

            expect(result).to.deep.equal(queryResponse);
            Sinon.assert.calledOnce(connectionStub.request);
            Sinon.assert.calledWith(connectionStub.request, {
                method: 'GET',
                url: `${Constants.APEX_GURU_REQUEST}/${requestId}`,
                body: ''
            });
        });

        test('Polls new before receiving a success status', async () => {
            const requestId = '12345';
            const pendingResponse: ApexGuruFunctions.ApexGuruQueryResponse = { status: 'new' };
            const successResponse: ApexGuruFunctions.ApexGuruQueryResponse = { status: 'success' };

            connectionStub.request
                .onFirstCall().resolves(pendingResponse)
                .onSecondCall().resolves(successResponse);

            const result = await ApexGuruFunctions.pollAndGetApexGuruResponse(connectionStub as unknown as Connection, requestId);

            expect(result).to.deep.equal(successResponse);
            Sinon.assert.calledTwice(connectionStub.request);
            Sinon.assert.alwaysCalledWith(connectionStub.request, {
                method: 'GET',
                url: `${Constants.APEX_GURU_REQUEST}/${requestId}`,
                body: ''
            });
        });

        test('Handles error during request', async () => {
            const requestId = '12345';
            connectionStub.request.rejects(new Error('Request failed'));

            try {
                await ApexGuruFunctions.pollAndGetApexGuruResponse(connectionStub as unknown as Connection, requestId);
                expect.fail('Expected function to throw an error');
            } catch (error) {
                expect(error).to.be.an.instanceOf(Error);
                expect((error as Error).message).to.equal('Request failed');
            }

            Sinon.assert.calledOnce(connectionStub.request);
            Sinon.assert.calledWith(connectionStub.request, {
                method: 'GET',
                url: `${Constants.APEX_GURU_REQUEST}/${requestId}`,
                body: ''
            });
        });
    });
});
