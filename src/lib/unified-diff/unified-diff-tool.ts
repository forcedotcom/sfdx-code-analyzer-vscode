import * as vscode from 'vscode';
import {UnifiedDiff, VSCodeUnifiedDiff} from "../../shared/UnifiedDiff";

export interface UnifiedDiffTool {
    hasDiff(document: vscode.TextDocument): boolean
    createDiff(document: vscode.TextDocument, newCode: string, acceptCallback: ()=>Promise<void>, rejectCallback: ()=>Promise<void>): Promise<void>
}

export class CodeGenieUnifiedDiffTool implements UnifiedDiffTool {
    hasDiff(document: vscode.TextDocument): boolean {
        return VSCodeUnifiedDiff.singleton.hasDiff(document);
    }

    async createDiff(document: vscode.TextDocument, newCode: string, acceptCallback: ()=>Promise<void>, rejectCallback: ()=>Promise<void>): Promise<void> {
        const diff = new UnifiedDiff(document, newCode);
        diff.allowAbilityToAcceptOrRejectIndividualHunks = false;
        diff.acceptAllCallback = acceptCallback;
        diff.rejectAllCallback = rejectCallback;
        await VSCodeUnifiedDiff.singleton.showUnifiedDiff(diff);
    }
}

