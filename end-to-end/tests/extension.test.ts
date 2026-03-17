import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {expect} from 'chai';

const SAMPLE_WORKSPACE = path.join(__dirname, '..', 'sampleWorkspace');
const E2E_LOG_FILENAME = '.sfca-e2e.log';
const ACTIVATION_ERROR_FILENAME = '.sfca-activation-error.txt';

const sampleFileUri1: vscode.Uri = vscode.Uri.file(path.join(SAMPLE_WORKSPACE, 'folder a', 'MyClassA1.cls'));
const sampleFileUri2: vscode.Uri = vscode.Uri.file(path.join(SAMPLE_WORKSPACE, 'folder a', 'MyClassA2.cls'));

suite('E2E Extension tests', function () {
    this.timeout(90000); // 90 seconds timeout for all tests in this suite

    setup(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    suiteTeardown(async () => {
        // Extension host stdout may not be captured in GHA; extension tees logs to globalStorageUri and/or workspace.
        // Read and print so extension logs appear in CI. Prefer path from extension command so we don't depend on exports shape.
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? SAMPLE_WORKSPACE;
        const lines: string[] = ['[E2E] Suite teardown — extension log / activation error:'];
        let logPath: string | null = null;
        try {
            const fromCommand = await vscode.commands.executeCommand<string>('sfca.getE2eLogPath');
            if (fromCommand && fs.existsSync(fromCommand)) {
                logPath = fromCommand;
            }
        } catch {
            // command may not exist in non-E2E runs
        }
        if (!logPath) {
            const ext = vscode.extensions.getExtension<{ context: vscode.ExtensionContext }>('salesforce.sfdx-code-analyzer-vscode');
            const logDir = ext?.exports?.context?.globalStorageUri?.fsPath;
            const fallbackPath = logDir ? path.join(logDir, E2E_LOG_FILENAME) : null;
            if (fallbackPath && fs.existsSync(fallbackPath)) {
                logPath = fallbackPath;
            }
        }
        if (!logPath) {
            const workspaceLogPath = path.join(workspaceRoot, E2E_LOG_FILENAME);
            if (fs.existsSync(workspaceLogPath)) {
                logPath = workspaceLogPath;
            }
        }
        if (logPath) {
            lines.push(fs.readFileSync(logPath, 'utf8'));
        } else {
            lines.push('(no .sfca-e2e.log)');
        }
        const activationErrorPath = path.join(workspaceRoot, ACTIVATION_ERROR_FILENAME);
        if (fs.existsSync(activationErrorPath)) {
            lines.push('Activation error file (.sfca-activation-error.txt):');
            lines.push(fs.readFileSync(activationErrorPath, 'utf8'));
        }
        console.log(lines.join('\n'));
    });

    test('Extension should be activated (since the sampleWorkspace has sfdx-project.json file)', async () => {
        const extension = vscode.extensions.getExtension('salesforce.sfdx-code-analyzer-vscode');
        if (!extension) {
            throw new Error('salesforce.sfdx-code-analyzer-vscode extension not found');
        }
        await extension.activate();
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