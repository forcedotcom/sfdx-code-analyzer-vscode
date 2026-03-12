import * as path from 'node:path';
import * as vscode from 'vscode';
import {expect} from 'chai';

const SAMPLE_WORKSPACE = path.join(__dirname, '..', 'sampleWorkspace');

const sampleFileUri1: vscode.Uri = vscode.Uri.file(path.join(SAMPLE_WORKSPACE, 'folder a', 'MyClassA1.cls'));
const sampleFileUri2: vscode.Uri = vscode.Uri.file(path.join(SAMPLE_WORKSPACE, 'folder a', 'MyClassA2.cls'));

const COMMAND_RUN_ON_ACTIVE_FILE = 'sfca.runOnActiveFile';
const ACTIVATION_WAIT_TIMEOUT_MS = 30_000;
const ACTIVATION_POLL_INTERVAL_MS = 100;

const CODE_ANALYZER_EXTENSION_ID = 'salesforce.sfdx-code-analyzer-vscode';

/**
 * Gathers diagnostic info about the Code Analyzer extension and commands for CI failure analysis.
 */
function getActivationDiagnostics(): string {
    const ext = vscode.extensions.getExtension(CODE_ANALYZER_EXTENSION_ID);
    const extPath = ext?.extensionPath ?? '(extension not found)';
    const isActive = ext?.isActive ?? false;
    const pkg = ext?.packageJSON as { version?: string } | undefined;
    const packageJsonVersion = pkg?.version ?? '(no version)';
    return [
        `extensionPath: ${extPath}`,
        `isActive: ${isActive}`,
        `packageJson.version: ${packageJsonVersion}`,
    ].join(', ');
}

/**
 * Waits for the Code Analyzer extension to register its commands before running tests that execute them.
 * In CI, Core 66.1.1 can take longer to install/activate; without this wait, tests may run before
 * our extension has finished activating and commands are "not found".
 */
async function waitForCodeAnalyzerCommands(): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < ACTIVATION_WAIT_TIMEOUT_MS) {
        const commands = await vscode.commands.getCommands();
        if (commands.includes(COMMAND_RUN_ON_ACTIVE_FILE)) {
            console.log(`[E2E activation] Command registered after ${Date.now() - start}ms. ${getActivationDiagnostics()}`);
            return;
        }
        await new Promise(resolve => setTimeout(resolve, ACTIVATION_POLL_INTERVAL_MS));
    }
    const diagnostics = getActivationDiagnostics();
    const sfcaCommands = (await vscode.commands.getCommands()).filter((id: string) => id.startsWith('sfca.'));
    throw new Error(
        `Code Analyzer command '${COMMAND_RUN_ON_ACTIVE_FILE}' did not register within ${ACTIVATION_WAIT_TIMEOUT_MS}ms. ` +
        `Extension may not have finished activating. Diagnostics: ${diagnostics}. ` +
        `Commands starting with 'sfca.': ${sfcaCommands.length > 0 ? sfcaCommands.join(', ') : '(none)'}`
    );
}

suite('E2E Extension tests', function () {
    this.timeout(90000); // 90 seconds timeout for all tests in this suite

    setup(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await waitForCodeAnalyzerCommands();
    });

    test('Extension should be activated (since the sampleWorkspace has sfdx-project.json file)', () => {
        const extension: vscode.Extension<unknown> = vscode.extensions.getExtension('salesforce.sfdx-code-analyzer-vscode');
        expect(extension.isActive).equals(true);
    });

    test('When file is open, then "sfca.runOnActiveFile" adds diagnostics and "sfca.removeDiagnosticsOnActiveFile" clears diagnostics', async () => {
        const doc = await vscode.workspace.openTextDocument(sampleFileUri1);
        await vscode.window.showTextDocument(doc);

        let diagnostics: vscode.Diagnostic[] = vscode.languages.getDiagnostics(sampleFileUri1);
        expect(diagnostics).to.be.empty;

        await vscode.commands.executeCommand('sfca.runOnActiveFile');
        diagnostics = vscode.languages.getDiagnostics(sampleFileUri1);
        expect(diagnostics).to.not.be.empty;

        // At present, we expect only violations for PMD's `ApexDoc` rule.
        for (const diagnostic of diagnostics) {
            expect(diagnostic.source).to.equal('pmd via Code Analyzer');
            expect(diagnostic.code).to.have.property('value', 'ApexDoc');
            expect(diagnostic.code).to.have.property('target');
            expect((diagnostic.code['target'] as vscode.Uri).scheme).to.equal('https');
        }

        await vscode.commands.executeCommand('sfca.removeDiagnosticsOnActiveFile');
        diagnostics = vscode.languages.getDiagnostics(sampleFileUri1);
        expect(diagnostics).to.be.empty;
    });

    test('When multiple files are selected, then "sfca.runOnSelected" adds diagnostics and "sfca.removeDiagnosticsOnSelectedFile" clears diagnostics', async () => {
        let diagnostics1: vscode.Diagnostic[] = vscode.languages.getDiagnostics(sampleFileUri1);
        let diagnostics2: vscode.Diagnostic[] = vscode.languages.getDiagnostics(sampleFileUri2);
        expect(diagnostics1).to.be.empty;
        expect(diagnostics2).to.be.empty;
        
        await vscode.commands.executeCommand('sfca.runOnSelected', null, [sampleFileUri1, sampleFileUri2]);

        diagnostics1 = vscode.languages.getDiagnostics(sampleFileUri1);
        diagnostics2 = vscode.languages.getDiagnostics(sampleFileUri2);
        expect(diagnostics1).to.not.be.empty;
        expect(diagnostics2).to.not.be.empty;
        // At present, we expect only violations for PMD's `ApexDoc` rule.
        for (const diagnostic of [...diagnostics1, ...diagnostics2]) {
            expect(diagnostic.source).to.equal('pmd via Code Analyzer');
            expect(diagnostic.code).to.have.property('value', 'ApexDoc');
        }

        await vscode.commands.executeCommand('sfca.removeDiagnosticsOnSelectedFile', null, [sampleFileUri1, sampleFileUri2]);
        
        diagnostics1 = vscode.languages.getDiagnostics(sampleFileUri1);
        diagnostics2 = vscode.languages.getDiagnostics(sampleFileUri2);
        expect(diagnostics1).to.be.empty;
        expect(diagnostics2).to.be.empty;
    });
});