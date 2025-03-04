import {ScannerAction} from "../../lib/actions/scanner-action"

describe("Temporary test suite", () => {
    it("temporary test", () => {
        // This is just temporary, in order to test that a test can run and code coverage report works.
        // Will remove this in the next PR.
        const action: ScannerAction = new ScannerAction('dummy', {
            scannerStrategy: null,
            display: null,
            diagnosticManager: null,
            telemetryService: null
        });
        expect(action).toBeDefined();
    });
});