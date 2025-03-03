/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {expect} from 'chai';
import * as Sinon from 'sinon';
import {DiagnosticConvertible} from '../../../lib/diagnostics';
import {CoreExtensionService} from '../../../lib/core-extension-service';
import * as Constants from '../../../lib/constants';
import * as ApexGuruFunctions from '../../../apexguru/apex-guru-service'
import { Connection } from '../../../lib/core-extension-service';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

suite('Apex Guru Test Suite', () => {
    const outputChannel = vscode.window.createOutputChannel('Salesforce Code Analyzer', {log: true});

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
            expect(result).to.equal(true);
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
            expect(result).to.equal(false);
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
            expect(result).to.equal(false);
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
            } catch (_e) {
              // ===== ASSERTIONS =====
              Sinon.assert.calledOnce(outputChannelSpy);
              Sinon.assert.calledWith(outputChannelSpy, Sinon.match.string);
            }
        });
    });

    suite('#transformStringToDiagnosticConvertibles', () => {
      test('Transforms valid JSON string to DiagnosticConvertibles for soql violations', () => {
          const fileName = 'TestFile.cls';
          const jsonString = JSON.stringify([{
              type: 'BestPractices',
              value: 'Avoid using System.debug',
              properties: [
                  { name: 'line_number', value: '10' },
                  { name: 'code_after', value: Buffer.from('System.out.println("New Hello World");').toString('base64') },
                  { name: 'code_before', value: Buffer.from('System.out.println("Old Hello World");').toString('base64') }
              ]
          }]);

		  const convertibles: DiagnosticConvertible[] = ApexGuruFunctions.transformStringToDiagnosticConvertibles(fileName, jsonString);

		  expect(convertibles).to.deep.equal([
			{
				rule: 'BestPractices',
				engine: 'apexguru',
				message: 'Avoid using System.debug',
				severity: 1,
				locations: [{
					file: fileName,
					startLine: 10,
					startColumn: 1
				}],
				primaryLocationIndex: 0,
				resources: ['https://help.salesforce.com/s/articleView?id=sf.apexguru_antipatterns.htm&type=5'],
				currentCode: 'System.out.println("Old Hello World");',
				suggestedCode: 'System.out.println("New Hello World");'
			}
		  ])
      });

      test('Transforms valid JSON string to DiagnosticConvertibles for code violations', () => {
        const fileName = 'TestFile.cls';
        const jsonString = JSON.stringify([{
            type: 'BestPractices',
            value: 'Avoid using System.debug',
            properties: [
                { name: 'line_number', value: '10' },
                { name: 'class_after', value: Buffer.from('System.out.println("New Hello World");').toString('base64') },
                { name: 'class_before', value: Buffer.from('System.out.println("Old Hello World");').toString('base64') }
            ]
        }]);

		const convertibles: DiagnosticConvertible[] = ApexGuruFunctions.transformStringToDiagnosticConvertibles(fileName, jsonString);

		expect(convertibles).to.deep.equal([
			{
				rule: 'BestPractices',
				engine: 'apexguru',
				message: 'Avoid using System.debug',
				severity: 1,
				locations: [{
					file: fileName,
					startLine: 10,
					startColumn: 1
				}],
				primaryLocationIndex: 0,
				resources: ['https://help.salesforce.com/s/articleView?id=sf.apexguru_antipatterns.htm&type=5'],
				currentCode: 'System.out.println("Old Hello World");',
				suggestedCode: 'System.out.println("New Hello World");'
			}
		]);
    });

    test('Transforms valid JSON string to DiagnosticConvertibles for violations with no suggestions', () => {
        const fileName = 'TestFile.cls';
        const jsonString = JSON.stringify([{
            type: 'BestPractices',
            value: 'Avoid using System.debug',
            properties: [
                { name: 'line_number', value: '10' }            ]
        }]);

		const convertibles: DiagnosticConvertible[] = ApexGuruFunctions.transformStringToDiagnosticConvertibles(fileName, jsonString);

		expect(convertibles).to.deep.equal([
			{
				rule: 'BestPractices',
				engine: 'apexguru',
				message: 'Avoid using System.debug',
				severity: 1,
				locations: [{
					file: fileName,
					startLine: 10,
					startColumn: 1
				}],
				primaryLocationIndex: 0,
				resources: ['https://help.salesforce.com/s/articleView?id=sf.apexguru_antipatterns.htm&type=5'],
				currentCode: '',
				suggestedCode: ''
			}
		])
    });

      test('Handles empty JSON string', () => {
          const fileName = 'TestFile.cls';
          const jsonString = '';

          expect(() => ApexGuruFunctions.transformStringToDiagnosticConvertibles(fileName, jsonString)).to.throw();
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
            expect(connectionStub.request.calledOnce).to.equal(true);
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
                expect((error as Error).message).to.equal('Failed to get a successful response from Apex Guru after maximum retries.');
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
    suite('#getConvertiblesWithSuggestions', () => {
        test('Returns 0 when there are no convertibles', () => {
            // ===== TEST =====
            const result = ApexGuruFunctions.getConvertiblesWithSuggestions([]);
            // ===== ASSERTIONS =====
            expect(result).to.equal(0);
        });

        test('Returns 0 when there are convertibles but no suggestions', () => {
            // ===== SETUP =====
			const convertibles: DiagnosticConvertible[] = [
				{
					rule: 'BestPractices',
					engine: 'fake_engine',
					message: 'Avoid using system.debug',
					severity: 1,
					locations: [{
						file: 'test.cls',
						startLine: 10,
						startColumn: 1
					}],
					primaryLocationIndex: 0,
					resources: ['TestFile.cls'],
					currentCode: 'Syste.debug();',
					suggestedCode: '' // No suggested code
				}
			];
            // ===== TEST =====
            const result = ApexGuruFunctions.getConvertiblesWithSuggestions(convertibles);
            // ===== ASSERTIONS =====
            expect(result).to.equal(0);
        });

        test('Returns correct count when there are convertibles with suggestions', () => {
            // ===== SETUP =====
			const convertibles: DiagnosticConvertible[] = [
				{
					rule: 'BestPractices',
					engine: 'fake_engine',
					message: 'Avoid using System.debug',
					severity: 1,
					locations: [{
						file: 'test.cls',
						startLine: 10,
						startColumn: 1
					}],
					primaryLocationIndex: 0,
					resources: ['testFile.cls'],
					currentCode: 'System.debug();',
					suggestedCode: 'System.out.println("Hello World");'
				}
			];
            // ===== TEST =====
            const result = ApexGuruFunctions.getConvertiblesWithSuggestions(convertibles);
            // ===== ASSERTIONS =====
            expect(result).to.equal(1);
        });

        test('Returns correct count when multiple convertibles have suggestions', () => {
            // ===== SETUP =====
			const convertibles: DiagnosticConvertible[] = [
				{
					rule: 'BestPractices',
					engine: 'fake_engine',
					message: 'Avoid using System.debug',
					severity: 1,
					locations: [{
						file: 'test.cls',
						startLine: 10,
						startColumn: 1
					}],
					primaryLocationIndex: 0,
					resources: ['testFile.cls'],
					currentCode: 'System.debug();',
					suggestedCode: 'System.out.println("Hello World");'
				}, {
					rule: 'CodeQuality',
					engine: 'fake_engine',
					message: 'Improve variable naming',
					severity: 1,
					locations: [{
						file: 'test.cls',
						startLine: 12,
						startColumn: 2
					}],
					primaryLocationIndex: 0,
					resources: ['TestFile.cls'],
					currentCode: 'int x;',
					suggestedCode: 'int userCount;'
				}
			];
            // ===== TEST =====
            const result = ApexGuruFunctions.getConvertiblesWithSuggestions(convertibles);
            // ===== ASSERTIONS =====
            expect(result).to.equal(2);
        });

        test('Ignores convertibles without suggestedCode', () => {
            // ===== SETUP =====
			const convertibles: DiagnosticConvertible[] = [
				{
					rule: 'BestPractices',
					engine: 'fake_engine',
					message: 'Avoid using System.debug',
					severity: 1,
					locations: [{
						file: 'test.cls',
						startLine: 10,
						startColumn: 1
					}],
					primaryLocationIndex: 0,
					resources: ['testFile.cls'],
					currentCode: 'System.debug();',
					suggestedCode: 'System.out.println("Hello World");'
				}, {
					rule: 'CodeQuality',
					engine: 'fake_engine',
					message: 'Improve variable naming',
					severity: 1,
					locations: [{
						file: 'test.cls',
						startLine: 12,
						startColumn: 2
					}],
					primaryLocationIndex: 0,
					resources: ['TestFile.cls'],
					currentCode: 'int x;',
					suggestedCode: '' // No suggestion
				}
			]
            // ===== TEST =====
            const result = ApexGuruFunctions.getConvertiblesWithSuggestions(convertibles);
            // ===== ASSERTIONS =====
            expect(result).to.equal(1);
        });
    });
});
