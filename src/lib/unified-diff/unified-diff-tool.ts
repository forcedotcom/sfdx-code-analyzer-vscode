import {DiffHunk, VSCodeUnifiedDiff} from "../../shared/UnifiedDiff";

export interface UnifiedDiffTool<T> {
    createDiff(code: string, file?: string): Promise<void>
    acceptDiffHunk(diffHunk: T): Promise<number>
    rejectDiffHunk(diffHunk: T): Promise<void>
    acceptAll(): Promise<number>
    rejectAll(): Promise<void>
}

export class CodeGenieUnifiedDiffTool implements UnifiedDiffTool<DiffHunk> {
    async createDiff(code: string, file?: string): Promise<void> {
        await VSCodeUnifiedDiff.singleton.unifiedDiff(code, file);
    }

    async acceptDiffHunk(diffHunk: DiffHunk): Promise<number> {
        await VSCodeUnifiedDiff.singleton.unifiedDiffAccept(diffHunk);
        return diffHunk.lines.length;
    }

    async rejectDiffHunk(diffHunk: DiffHunk): Promise<void> {
        await VSCodeUnifiedDiff.singleton.unifiedDiffReject(diffHunk)
    }

    async acceptAll(): Promise<number> {
        return await VSCodeUnifiedDiff.singleton.unifiedDiffAcceptAll();
    }

    async rejectAll(): Promise<void> {
        await VSCodeUnifiedDiff.singleton.unifiedDiffRejectAll();
    }
}

