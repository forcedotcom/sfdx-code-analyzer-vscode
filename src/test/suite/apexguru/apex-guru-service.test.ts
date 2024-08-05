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
        
            // ===== TEST =====
            const result = await ApexGuruFunctions.initiateApexGuruRequest(vscode.Uri.file('dummyPath'), outputChannel);
        
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
        
            // ===== TEST =====
            try {
              await ApexGuruFunctions.initiateApexGuruRequest(vscode.Uri.file('dummyPath'), outputChannel);
            } catch (e) {
              // ===== ASSERTIONS =====
              Sinon.assert.calledOnce(outputChannelSpy);
              Sinon.assert.calledWith(outputChannelSpy, Sinon.match.string);
            }
        });
    });
});
