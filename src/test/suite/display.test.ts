/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { Display } from '@salesforce/sfdx-scanner/lib/lib/Display';
import { VSCodeDisplay } from '../../lib/display';
import {expect} from 'chai';

suite('display.ts', () => {
    test('displayConfirmationPrompt throws not implemented error', async () => {
        const display:VSCodeDisplay = new VSCodeDisplay();
        let err: Error = null;
        try {
            display.displayConfirmationPrompt('some message');
        } catch (e) {
            err = e;
        }
        expect(err).to.exist;
        expect(err.message).to.equal('Method not implemented');
    });

    test('displayInfo adds to std out', async () => {
        const display:VSCodeDisplay = new VSCodeDisplay();
        display.displayInfo('some info message');
        expect(display.getInfo().length).to.equal(1);
        expect(display.getInfo()[0]).to.equal('some info message');
    });

    test('displayVerboseInfo adds to std out', async () => {
        const display:VSCodeDisplay = new VSCodeDisplay();
        display.displayVerboseInfo('some info message');
        expect(display.getInfo().length).to.equal(1);
        expect(display.getInfo()[0]).to.equal('some info message');
    });

    test('displayError adds to std err', async () => {
        const display:VSCodeDisplay = new VSCodeDisplay();
        display.displayError('some error message');
        expect(display.getErrorsAndWarnings().length).to.equal(1);
        expect(display.getErrorsAndWarnings()[0]).to.equal('some error message');
    });

    test('displayWarning adds to std err', async () => {
        const display:VSCodeDisplay = new VSCodeDisplay();
        display.displayWarning('some warning message');
        expect(display.getErrorsAndWarnings().length).to.equal(1);
        expect(display.getErrorsAndWarnings()[0]).to.equal('some warning message');
    });

    test('displayVerboseWarning adds to std err', async () => {
        const display:VSCodeDisplay = new VSCodeDisplay();
        display.displayVerboseWarning('some warning message');
        expect(display.getErrorsAndWarnings().length).to.equal(1);
        expect(display.getErrorsAndWarnings()[0]).to.equal('some warning message');
    });

    test('Verify displayUniqueWarning adds to std err', async () => {
        const display:VSCodeDisplay = new VSCodeDisplay();
        display.displayUniqueWarning('some warning message');
        expect(display.getErrorsAndWarnings().length).to.equal(1);
        expect(display.getErrorsAndWarnings()[0]).to.equal('some warning message');
    });

    test('displayStyledHeader adds to std out', async () => {
        const display:VSCodeDisplay = new VSCodeDisplay();
        display.displayStyledHeader('some info message');
        expect(display.getInfo().length).to.equal(1);
        expect(display.getInfo()[0]).to.equal('some info message');
    });

    test('All other methods are no-op ', async () => {
        const display:VSCodeDisplay = new VSCodeDisplay();
        display.spinnerStart('start message');
        display.spinnerUpdate('update message');
        display.spinnerWait();
        display.spinnerStop('stop message');

        expect(display.getInfo().length).to.equal(0);
        expect(display.getErrorsAndWarnings().length).to.equal(0);
    });

});
