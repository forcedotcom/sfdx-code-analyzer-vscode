/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import * as Sinon from 'sinon';
import * as vscode from 'vscode';
import {SettingsManagerImpl} from '../../lib/settings';

suite('SettingsManager Test Suite', () => {
    let getConfigurationStub: Sinon.SinonStub;

    setup(() => {
        getConfigurationStub = Sinon.stub(vscode.workspace, 'getConfiguration');
    });

    teardown(() => {
        Sinon.restore();
    });

    test('getAnalyzeOnSave should return the analyzeOnSave enabled setting', () => {
        // ===== SETUP =====
        const mockAnalyzeOnSaveEnabled = true;
        getConfigurationStub.withArgs('codeAnalyzer.analyzeOnSave').returns({
            get: Sinon.stub().returns(mockAnalyzeOnSaveEnabled)
        });

        // ===== TEST =====
        const result = new SettingsManagerImpl().getAnalyzeOnSave();

        // ===== ASSERTIONS =====
        expect(result).to.equal(mockAnalyzeOnSaveEnabled);
        expect(getConfigurationStub.calledOnceWith('codeAnalyzer.analyzeOnSave')).to.equal(true);
    });

    test('getAnalyzeOnOpen should return the analyzeOnOpen enabled setting', () => {
        // ===== SETUP =====
        const mockAnalyzeOnOpenEnabled = false;
        getConfigurationStub.withArgs('codeAnalyzer.analyzeOnOpen').returns({
            get: Sinon.stub().returns(mockAnalyzeOnOpenEnabled)
        });

        // ===== TEST =====
        const result = new SettingsManagerImpl().getAnalyzeOnOpen();

        // ===== ASSERTIONS =====
        expect(result).to.equal(mockAnalyzeOnOpenEnabled);
        expect(getConfigurationStub.calledOnceWith('codeAnalyzer.analyzeOnOpen')).to.equal(true);
    });

    test('getApexGuruEnabled should return the apexGuru enabled setting', () => {
        // ===== SETUP =====
        const mockAnalyzeOnSaveEnabled = true;
        getConfigurationStub.withArgs('codeAnalyzer.apexGuru').returns({
            get: Sinon.stub().returns(mockAnalyzeOnSaveEnabled)
        });

        // ===== TEST =====
        const result = new SettingsManagerImpl().getApexGuruEnabled();

        // ===== ASSERTIONS =====
        expect(result).to.equal(mockAnalyzeOnSaveEnabled);
        expect(getConfigurationStub.calledOnceWith('codeAnalyzer.apexGuru')).to.equal(true);
    });
});
