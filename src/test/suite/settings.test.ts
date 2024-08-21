/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import * as Sinon from 'sinon';
import * as vscode from 'vscode';
import {SettingsManager} from '../../lib/settings';

suite('SettingsManager Test Suite', () => {
    let getConfigurationStub: Sinon.SinonStub;

    setup(() => {
        getConfigurationStub = Sinon.stub(vscode.workspace, 'getConfiguration');
    });

    teardown(() => {
        Sinon.restore();
    });

    test('getPmdCustomConfigFile should return the customConfigFile setting', () => {
        // ===== SETUP =====
        const mockCustomConfigFile = 'config/path/to/customConfigFile';
        getConfigurationStub.withArgs('codeAnalyzer.pMD').returns({
            get: Sinon.stub().returns(mockCustomConfigFile)
        });

        // ===== TEST =====
        const result = SettingsManager.getPmdCustomConfigFile();

        // ===== ASSERTIONS =====
        expect(result).to.equal(mockCustomConfigFile);
        expect(getConfigurationStub.calledOnceWith('codeAnalyzer.pMD')).to.be.true;
    });

    test('getGraphEngineDisableWarningViolations should return the disableWarningViolations setting', () => {
        // ===== SETUP =====
        const mockDisableWarningViolations = true;
        getConfigurationStub.withArgs('codeAnalyzer.graphEngine').returns({
            get: Sinon.stub().returns(mockDisableWarningViolations)
        });

        // ===== TEST =====
        const result = SettingsManager.getGraphEngineDisableWarningViolations();

        // ===== ASSERTIONS =====
        expect(result).to.equal(mockDisableWarningViolations);
        expect(getConfigurationStub.calledOnceWith('codeAnalyzer.graphEngine')).to.be.true;
    });

    test('getGraphEngineThreadTimeout should return the threadTimeout setting', () => {
        // ===== SETUP =====
        const mockThreadTimeout = 30000;
        getConfigurationStub.withArgs('codeAnalyzer.graphEngine').returns({
            get: Sinon.stub().returns(mockThreadTimeout)
        });

        // ===== TEST =====
        const result = SettingsManager.getGraphEngineThreadTimeout();

        // ===== ASSERTIONS =====
        expect(result).to.equal(mockThreadTimeout);
        expect(getConfigurationStub.calledOnceWith('codeAnalyzer.graphEngine')).to.be.true;
    });

    test('getGraphEnginePathExpansionLimit should return the pathExpansionLimit setting', () => {
        // ===== SETUP =====
        const mockPathExpansionLimit = 100;
        getConfigurationStub.withArgs('codeAnalyzer.graphEngine').returns({
            get: Sinon.stub().returns(mockPathExpansionLimit)
        });

        // ===== TEST =====
        const result = SettingsManager.getGraphEnginePathExpansionLimit();

        // ===== ASSERTIONS =====
        expect(result).to.equal(mockPathExpansionLimit);
        expect(getConfigurationStub.calledOnceWith('codeAnalyzer.graphEngine')).to.be.true;
    });

    test('getGraphEngineJvmArgs should return the jvmArgs setting', () => {
        // ===== SETUP =====
        const mockJvmArgs = '-Xmx2048m';
        getConfigurationStub.withArgs('codeAnalyzer.graphEngine').returns({
            get: Sinon.stub().returns(mockJvmArgs)
        });

        // ===== TEST =====
        const result = SettingsManager.getGraphEngineJvmArgs();

        // ===== ASSERTIONS =====
        expect(result).to.equal(mockJvmArgs);
        expect(getConfigurationStub.calledOnceWith('codeAnalyzer.graphEngine')).to.be.true;
    });

    test('getAnalyzeOnSave should return the analyzeOnSave enabled setting', () => {
        // ===== SETUP =====
        const mockAnalyzeOnSaveEnabled = true;
        getConfigurationStub.withArgs('codeAnalyzer.analyzeOnSave').returns({
            get: Sinon.stub().returns(mockAnalyzeOnSaveEnabled)
        });

        // ===== TEST =====
        const result = SettingsManager.getAnalyzeOnSave();

        // ===== ASSERTIONS =====
        expect(result).to.equal(mockAnalyzeOnSaveEnabled);
        expect(getConfigurationStub.calledOnceWith('codeAnalyzer.analyzeOnSave')).to.be.true;
    });

    test('getAnalyzeOnOpen should return the analyzeOnOpen enabled setting', () => {
        // ===== SETUP =====
        const mockAnalyzeOnOpenEnabled = false;
        getConfigurationStub.withArgs('codeAnalyzer.analyzeOnOpen').returns({
            get: Sinon.stub().returns(mockAnalyzeOnOpenEnabled)
        });

        // ===== TEST =====
        const result = SettingsManager.getAnalyzeOnOpen();

        // ===== ASSERTIONS =====
        expect(result).to.equal(mockAnalyzeOnOpenEnabled);
        expect(getConfigurationStub.calledOnceWith('codeAnalyzer.analyzeOnOpen')).to.be.true;
    });

    test('getEnginesToRun should return the engines setting', () => {
        // ===== SETUP =====
        const mockEngines = 'engine1, engine2';
        getConfigurationStub.withArgs('codeAnalyzer.scanner').returns({
            get: Sinon.stub().returns(mockEngines)
        });

        // ===== TEST =====
        const result = SettingsManager.getEnginesToRun();

        // ===== ASSERTIONS =====
        expect(result).to.equal(mockEngines);
        expect(getConfigurationStub.calledOnceWith('codeAnalyzer.scanner')).to.be.true;
    });

    test('getNormalizeSeverityEnabled should return the normalizeSeverity enabled setting', () => {
        // ===== SETUP =====
        const mockNormalizeSeverityEnabled = true;
        getConfigurationStub.withArgs('codeAnalyzer.normalizeSeverity').returns({
            get: Sinon.stub().returns(mockNormalizeSeverityEnabled)
        });

        // ===== TEST =====
        const result = SettingsManager.getNormalizeSeverityEnabled();

        // ===== ASSERTIONS =====
        expect(result).to.equal(mockNormalizeSeverityEnabled);
        expect(getConfigurationStub.calledOnceWith('codeAnalyzer.normalizeSeverity')).to.be.true;
    });

    test('getRulesCategory should return the rules category setting', () => {
        // ===== SETUP =====
        const mockRulesCategory = 'bestPractices';
        getConfigurationStub.withArgs('codeAnalyzer.rules').returns({
            get: Sinon.stub().returns(mockRulesCategory)
        });

        // ===== TEST =====
        const result = SettingsManager.getRulesCategory();

        // ===== ASSERTIONS =====
        expect(result).to.equal(mockRulesCategory);
        expect(getConfigurationStub.calledOnceWith('codeAnalyzer.rules')).to.be.true;
    });

    test('getApexGuruEnabled should return the apexGuru enabled setting', () => {
        // ===== SETUP =====
        const mockAnalyzeOnSaveEnabled = true;
        getConfigurationStub.withArgs('codeAnalyzer.apexGuru').returns({
            get: Sinon.stub().returns(mockAnalyzeOnSaveEnabled)
        });

        // ===== TEST =====
        const result = SettingsManager.getApexGuruEnabled();

        // ===== ASSERTIONS =====
        expect(result).to.equal(mockAnalyzeOnSaveEnabled);
        expect(getConfigurationStub.calledOnceWith('codeAnalyzer.apexGuru')).to.be.true;
    });
});