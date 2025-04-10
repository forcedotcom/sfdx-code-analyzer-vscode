import * as vscode from 'vscode';
import {UnifiedDiff, CodeGenieUnifiedDiffService} from "../shared/UnifiedDiff";
import {SettingsManager} from "./settings";
import {messages} from "./messages";
import {Display} from "./display";

export interface UnifiedDiffService extends vscode.Disposable {
    /**
     * Function called during activation of the extension to register the service with VS Code
     */
    register(): void;

    /**
     * Verifies whether a unified diff can be shown for the document.
     *
     * If a diff can't be shown, then the UnifiedDiffService should display any warning or error message boxes before
     * returning false. Otherwise, if a diff can be shown then return true.
     *
     * @param document TextDocument to display unified diff
     */
    verifyCanShowDiff(document: vscode.TextDocument): boolean

    /**
     * Shows a unified diff on a document
     *
     * @param document TextDocument to display unified diff
     * @param newCode the new code that will replace the entire current document's code
     * @param acceptCallback function to call when a user accepts the unified diff
     * @param rejectCallback function to call when a user rejects the unified diff
     */
    showDiff(document: vscode.TextDocument, newCode: string, acceptCallback: ()=>Promise<void>, rejectCallback: ()=>Promise<void>): Promise<void>
}

/**
 * Implementation of UnifiedDiffService using the shared CodeGenieUnifiedDiffService
 */
export class UnifiedDiffServiceImpl implements UnifiedDiffService {
    private readonly codeGenieUnifiedDiffService: CodeGenieUnifiedDiffService;
    private readonly settingsManager: SettingsManager;
    private readonly display: Display;

    constructor(settingsManager: SettingsManager, display: Display) {
        this.codeGenieUnifiedDiffService = new CodeGenieUnifiedDiffService();
        this.settingsManager = settingsManager;
        this.display = display;
    }

    register(): void {
        this.codeGenieUnifiedDiffService.register();
    }

    dispose(): void {
        this.codeGenieUnifiedDiffService.dispose();
    }

    verifyCanShowDiff(document: vscode.TextDocument): boolean {
        if (this.codeGenieUnifiedDiffService.hasDiff(document)) {
            void this.codeGenieUnifiedDiffService.focusOnDiff(
                this.codeGenieUnifiedDiffService.getDiff(document)
            );
            this.display.displayWarning(messages.unifiedDiff.mustAcceptOrRejectDiffFirst);
            return false;
        } else if (!this.settingsManager.getEditorCodeLensEnabled()) {
            this.display.displayWarning(messages.unifiedDiff.editorCodeLensMustBeEnabled,
                {
                    text: messages.buttons.showSettings,
                    callback: (): void => {
                        const settingUri: vscode.Uri = vscode.Uri.parse('vscode://settings/editor.codeLens');
                        void vscode.commands.executeCommand('vscode.open', settingUri);
                    }
                });
            return false;
        }
        return true;
    }

    async showDiff(document: vscode.TextDocument, newCode: string, acceptCallback: ()=>Promise<void>, rejectCallback: ()=>Promise<void>): Promise<void> {
        const diff = new UnifiedDiff(document, newCode);
        diff.allowAbilityToAcceptOrRejectIndividualHunks = false;
        diff.acceptAllCallback = acceptCallback;
        diff.rejectAllCallback = rejectCallback;
        try {
            await this.codeGenieUnifiedDiffService.showUnifiedDiff(diff);
        } catch (err) {
            await this.codeGenieUnifiedDiffService.revertUnifiedDiff(document);
            throw err;
        }
    }
}

