import vscode from "vscode";
import {Logger} from "./logger";

export type DisplayButton = {
    text: string
    callback: ()=>void
}

export interface Display {
    displayInfo(infoMsg: string, ...buttons: DisplayButton[]): void;
    displayWarning(warnMsg: string, ...buttons: DisplayButton[]): void;
    displayError(errorMsg: string, ...buttons: DisplayButton[]): void;
}

export class VSCodeDisplay implements Display {
    private readonly logger: Logger;

    public constructor(logger: Logger) {
        this.logger = logger;
    }

    displayInfo(infoMsg: string, ...buttons: DisplayButton[]): void {
        if (buttons.length > 0) {
            void vscode.window.showInformationMessage(infoMsg, ...buttons.map(b => b.text)).then(selectedText => {
                const selectedButton: DisplayButton = buttons.find(b => b.text === selectedText);
                if (selectedButton) {
                    selectedButton.callback();
                }
            });
        } else {
            void vscode.window.showInformationMessage(infoMsg);
        }
        this.logger.log(infoMsg);
    }

    displayWarning(warnMsg: string, ...buttons: DisplayButton[]): void {
        void vscode.window.showWarningMessage(warnMsg, ...buttons.map(b => b.text)).then(selectedText => {
            const selectedButton: DisplayButton = buttons.find(b => b.text === selectedText);
            if (selectedButton) {
                selectedButton.callback();
            }
        });
        this.logger.warn(warnMsg);
    }

    displayError(errorMsg: string, ...buttons: DisplayButton[]): void {
        void vscode.window.showErrorMessage(errorMsg, ...buttons.map(b => b.text)).then(selectedText => {
            const selectedButton: DisplayButton = buttons.find(b => b.text === selectedText);
            if (selectedButton) {
                selectedButton.callback();
            }
        });
        this.logger.error(errorMsg);
    }
}
