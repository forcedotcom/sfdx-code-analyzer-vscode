import * as vscode from 'vscode';
import {UnifiedDiff, CodeGenieUnifiedDiffService} from "../shared/UnifiedDiff";

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

    constructor() {
        this.codeGenieUnifiedDiffService = new CodeGenieUnifiedDiffService();
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
        const diff = new UnifiedDiff(document, newCode);
        diff.allowAbilityToAcceptOrRejectIndividualHunks = false;
        diff.acceptAllCallback = acceptCallback;
        diff.rejectAllCallback = rejectCallback;
        await this.codeGenieUnifiedDiffService.showUnifiedDiff(diff);
    }

    async clearDiff(document: vscode.TextDocument): Promise<void> {
        await this.codeGenieUnifiedDiffService.revertUnifiedDiff(document);
    }
}

