import * as vscode from 'vscode';

export class ScanManager implements vscode.Disposable {
    private alreadyScannedFiles: Set<string> = new Set();

    haveAlreadyScannedFile(file: string): boolean {
        return this.alreadyScannedFiles.has(file);
    }
    
    removeFileFromAlreadyScannedFiles(file: string): void {
        this.alreadyScannedFiles.delete(file);
    }
    
    addFileToAlreadyScannedFiles(file: string) {
        this.alreadyScannedFiles.add(file);
    }

    public dispose(): void {
        this.alreadyScannedFiles.clear();
    }
}