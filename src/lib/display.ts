import vscode from "vscode";
import {Logger} from "./logger";

export type ProgressEvent = {
    message?: string;
    increment?: number;
};

export type DisplayButton = {
    text: string
    callback: ()=>void
}

export interface Display {
    displayProgress(progressEvent: ProgressEvent): void;
    displayInfo(infoMsg: string): void;
    displayWarning(warnMsg: string, ...buttons: DisplayButton[]): void;
    displayError(errorMsg: string): void;
}

export class VSCodeDisplay implements Display {
    private readonly logger: Logger;
    private readonly progressReporter: vscode.Progress<ProgressEvent> | undefined;

    public constructor(logger: Logger, progressReporter?: vscode.Progress<ProgressEvent>) {
        this.logger = logger;
        this.progressReporter = progressReporter;
    }

    public displayProgress(progressEvent: ProgressEvent): void {
        if (this.progressReporter) {
            this.progressReporter.report(progressEvent);
        }
        this.logger.trace(`[${progressEvent.increment}] ${progressEvent.message}`);
    }

    displayInfo(infoMsg: string): void {
        // Not waiting for promise because we didn't add buttons and don't care if user ignores the message.
        void vscode.window.showInformationMessage(infoMsg);
        this.logger.log(infoMsg);
    }

    displayWarning(warnMsg: string, ...buttons: DisplayButton[]): void {
        void vscode.window.showWarningMessage(warnMsg, ...buttons.map(b => b.text)).then(selectedText => {
            const selectedButton: DisplayButton = buttons.find(b => b.text === selectedText);
            if(selectedButton) {
                selectedButton.callback();
            }
        });
        this.logger.warn(warnMsg);
    }

    displayError(errorMsg: string): void {
        // Not waiting for promise because we didn't add buttons and don't care if user ignores the message.
        void vscode.window.showErrorMessage(errorMsg);
        this.logger.error(errorMsg);
    }
}
