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
                  currentCode: '',
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

        test('Returns response on successful query within timeout', async () => {
            // ===== SETUP =====
            const requestId = 'dummyRequestId';
            const maxWaitTimeInSeconds = 5;
            const retryInterval = 100;
    
            const queryResponse: ApexGuruFunctions.ApexGuruQueryResponse = { status: 'success', report: '' };
            connectionStub.request.resolves(queryResponse);

            // ===== TEST =====
            const response = await ApexGuruFunctions.pollAndGetApexGuruResponse(connectionStub as unknown as Connection, requestId, maxWaitTimeInSeconds, retryInterval);
    
            // ===== ASSERTIONS =====
            expect(response).to.deep.equal(queryResponse);
            expect(connectionStub.request.calledOnce).to.be.true;
        });
    
        test('Retries until successful response within timeout', async () => {
            // ===== SETUP =====
            const requestId = 'dummyRequestId';
            const maxWaitTimeInSeconds = 5;
            const retryInterval = 100;
    
            // ===== TEST =====
            const pendingResponse: ApexGuruFunctions.ApexGuruQueryResponse = { status: 'pending', report: '' };
            const successResponse: ApexGuruFunctions.ApexGuruQueryResponse = { status: 'success', report: '' };
    
            connectionStub.request.onCall(0).resolves(pendingResponse);
            connectionStub.request.onCall(1).resolves(pendingResponse);
            connectionStub.request.onCall(2).resolves(successResponse);
    
            const response = await ApexGuruFunctions.pollAndGetApexGuruResponse(connectionStub as unknown as Connection, requestId, maxWaitTimeInSeconds, retryInterval);
    
            // ===== ASSERTIONS =====
            expect(response).to.deep.equal(successResponse);
            expect(connectionStub.request.callCount).to.equal(3);
        });
    
        test('Throws error after timeout is exceeded', async () => {
            // ===== SETUP =====
            const requestId = 'dummyRequestId';
            const maxWaitTimeInSeconds = 0;
            const retryInterval = 100; 
    
            const pendingResponse: ApexGuruFunctions.ApexGuruQueryResponse = { status: 'new', report: '' };
            connectionStub.request.resolves(pendingResponse);

            // ===== TEST =====
            try {
                await ApexGuruFunctions.pollAndGetApexGuruResponse(connectionStub as unknown as Connection, requestId, maxWaitTimeInSeconds, retryInterval);
                throw new Error('Expected to throw an error due to timeout');
            } catch (error) {
                expect(error.message).to.equal('Failed to get a successful response from Apex Guru after maximum retries.');
            }

            // ===== ASSERTIONS =====
            const expectedCallCount = Math.floor((maxWaitTimeInSeconds * 1000) / retryInterval);
            expect(connectionStub.request.callCount).to.be.at.least(expectedCallCount);
        });
    
        test('Handles request errors and continues retrying', async () => {
            // ===== SETUP =====
            const requestId = 'dummyRequestId';
            const maxWaitTimeInSeconds = 5;
            const retryInterval = 100;
    
            const pendingResponse: ApexGuruFunctions.ApexGuruQueryResponse = { status: 'new', report: '' };
            const successResponse: ApexGuruFunctions.ApexGuruQueryResponse = { status: 'success', report: '' };
    
            connectionStub.request.onCall(0).rejects(new Error('Some error'));
            connectionStub.request.onCall(1).resolves(pendingResponse);
            connectionStub.request.onCall(2).resolves(successResponse);
    
            // ===== TEST =====
            const response = await ApexGuruFunctions.pollAndGetApexGuruResponse(connectionStub as unknown as Connection, requestId, maxWaitTimeInSeconds, retryInterval);
    
            // ===== ASSERTIONS =====
            expect(response).to.deep.equal(successResponse);
            expect(connectionStub.request.callCount).to.equal(3);
        });

        test('Throws last error if maximum retries are exhausted', async () => {
            // ===== SETUP =====
            const requestId = 'dummyRequestId';
            const maxWaitTimeInSeconds = 1; // Set to 1 second for quick test
            const retryInterval = 500;
    
            const errorResponse: Error = new Error('Some dummy error');
    
            connectionStub.request.rejects(errorResponse);
    
            // ===== TEST =====
            try {
                await ApexGuruFunctions.pollAndGetApexGuruResponse(connectionStub as unknown as Connection, requestId, maxWaitTimeInSeconds, retryInterval);
                expect.fail('Expected function to throw an error');
            } catch (error) {
                // ===== ASSERTIONS =====
                expect((error as Error).message).to.contain('Failed to get a successful response from Apex Guru after maximum retries.Some dummy error');
            }
    
            expect(connectionStub.request.callCount).to.be.greaterThan(0);
        });
    });
});
