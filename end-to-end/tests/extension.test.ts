import * as path from 'node:path';
import * as vscode from 'vscode';
import {expect} from 'chai';

const SAMPLE_WORKSPACE = path.join(__dirname, '..', 'sampleWorkspace');

const sampleFileUri1: vscode.Uri = vscode.Uri.file(path.join(SAMPLE_WORKSPACE, 'folder a', 'MyClassA1.cls'));
const sampleFileUri2: vscode.Uri = vscode.Uri.file(path.join(SAMPLE_WORKSPACE, 'folder a', 'MyClassA2.cls'));

suite('E2E Extension tests', function () {
    this.timeout(90000); // 90 seconds timeout for all tests in this suite

    setup(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
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