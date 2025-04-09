import * as vscode from 'vscode';
import {UnifiedDiff, CodeGenieUnifiedDiffService} from "../shared/UnifiedDiff";
import {SettingsManager} from "./settings";
import {messages} from "./messages";

export interface UnifiedDiffService extends vscode.Disposable {
    register(): void;
    hasDiff(document: vscode.TextDocument): boolean
    showDiff(document: vscode.TextDocument, newCode: string, acceptCallback: ()=>Promise<void>, rejectCallback: ()=>Promise<void>): Promise<void>
    clearDiff(document: vscode.TextDocument): Promise<void>;
}

/**
 * Implementation of UnifiedDiffService using the shared CodeGenieUnifiedDiffService
 */
export class UnifiedDiffServiceImpl implements UnifiedDiffService {
    private readonly codeGenieUnifiedDiffService: CodeGenieUnifiedDiffService;
    private readonly settingsManager: SettingsManager;

    constructor(settingsManager: SettingsManager) {
        this.codeGenieUnifiedDiffService = new CodeGenieUnifiedDiffService();
        this.settingsManager = settingsManager;
    }

    register(): void {
        this.codeGenieUnifiedDiffService.register();
    }

    dispose(): void {
        this.codeGenieUnifiedDiffService.dispose();
    }

    hasDiff(document: vscode.TextDocument): boolean {
        return this.codeGenieUnifiedDiffService.hasDiff(document);
    }

    async showDiff(document: vscode.TextDocument, newCode: string, acceptCallback: ()=>Promise<void>, rejectCallback: ()=>Promise<void>): Promise<void> {
        this.validateCanShowDiff();
        const diff = new UnifiedDiff(document, newCode);
        diff.allowAbilityToAcceptOrRejectIndividualHunks = false;
        diff.acceptAllCallback = acceptCallback;
        diff.rejectAllCallback = rejectCallback;
        await this.codeGenieUnifiedDiffService.showUnifiedDiff(diff);
    }

    async clearDiff(document: vscode.TextDocument): Promise<void> {
        await this.codeGenieUnifiedDiffService.revertUnifiedDiff(document);
    }

    private validateCanShowDiff(): void {
        if (!this.settingsManager.getEditorCodeLensEnabled()) {
            void vscode.window.showWarningMessage(messages.unifiedDiff.editorCodeLensMustBeEnabled, messages.buttons.showSettings).then(selection => {
                if (selection === messages.buttons.showSettings) {
                    const settingUri = vscode.Uri.parse('vscode://settings/editor.codeLens');
                    vscode.commands.executeCommand('vscode.open', settingUri);
                }
            });
            throw new Error(messages.unifiedDiff.editorCodeLensMustBeEnabled);
        }
    }
}

