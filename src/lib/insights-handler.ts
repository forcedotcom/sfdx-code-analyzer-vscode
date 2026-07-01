import * as vscode from "vscode";
import {EngineInsight} from "./code-analyzer";
import {Display, DisplayButton} from "./display";
import {Logger} from "./logger";
import {messages} from "./messages";
import {ExternalServiceProvider} from "./external-services/external-service-provider";
import {WindowManager} from "./vscode-api";

const ISSUES_URL = 'https://github.com/forcedotcom/sfdx-code-analyzer-vscode/issues/new';

export class InsightsHandler {
    private readonly display: Display;
    private readonly logger: Logger;
    private readonly externalServiceProvider: ExternalServiceProvider;
    private readonly windowManager: WindowManager;
    private readonly suppressedErrorCodes: Set<string> = new Set();

    constructor(display: Display, logger: Logger, externalServiceProvider: ExternalServiceProvider, windowManager: WindowManager) {
        this.display = display;
        this.logger = logger;
        this.externalServiceProvider = externalServiceProvider;
        this.windowManager = windowManager;
    }

    handleInsights(insights: Record<string, EngineInsight> | undefined, retriggerScan: () => void): void {
        if (!insights || !insights.apexguru) {
            return;
        }

        const apexguruInsight = insights.apexguru;
        if (apexguruInsight.status !== 'skipped') {
            return;
        }

        const error = apexguruInsight.error;
        if (!error) {
            return;
        }

        if (this.suppressedErrorCodes.has(error.code)) {
            return;
        }

        this.suppressedErrorCodes.add(error.code);

        switch (error.code) {
            case 'NO_ORG_CONNECTION':
                this.handleNoOrgConnection(error.message, error.remediation);
                break;
            case 'API_UNAVAILABLE':
                this.handleApiUnavailable(error.message, error.remediation, retriggerScan);
                break;
            case 'UNEXPECTED_ERROR':
                this.handleUnexpectedError(error.message, error.remediation);
                break;
            default:
                this.logger.warn(`Unknown insight error code: ${error.code}`);
        }
    }

    private handleNoOrgConnection(message: string, remediation: string): void {
        const connectOrgButton: DisplayButton = {
            text: messages.insights.buttons.connectOrg,
            callback: () => this.triggerConnectOrg(remediation)
        };

        this.display.displayInfo(
            messages.insights.apexGuruSkipped.noOrgConnection(remediation),
            connectOrgButton
        );
        this.logger.log(message);
    }

    private handleApiUnavailable(message: string, remediation: string, retriggerScan: () => void): void {
        const retryScanButton: DisplayButton = {
            text: messages.insights.buttons.retryScan,
            callback: retriggerScan
        };
        const detailsButton: DisplayButton = {
            text: messages.insights.buttons.details,
            callback: () => {
                this.logger.log(remediation);
                this.windowManager.showLogOutputWindow();
            }
        };

        this.display.displayInfo(
            messages.insights.apexGuruSkipped.apiUnavailable(message),
            retryScanButton,
            detailsButton
        );
        this.logger.log(message);
    }

    private handleUnexpectedError(message: string, _remediation: string): void {
        const viewDetailsButton: DisplayButton = {
            text: messages.insights.buttons.viewDetails,
            callback: () => this.windowManager.showLogOutputWindow()
        };
        const reportIssueButton: DisplayButton = {
            text: messages.insights.buttons.reportIssue,
            callback: () => this.windowManager.showExternalUrl(ISSUES_URL)
        };

        this.display.displayInfo(
            messages.insights.apexGuruSkipped.unexpectedError(message),
            viewDetailsButton,
            reportIssueButton
        );
        this.logger.log(message);
    }

    private triggerConnectOrg(remediation: string): void {
        void this.externalServiceProvider.isOrgConnectionServiceAvailable().then(available => {
            if (available) {
                void vscode.commands.executeCommand('sfdx.authorize.org');
            } else {
                this.display.displayInfo(messages.insights.fallback.connectOrgManual(remediation));
            }
        });
    }
}
