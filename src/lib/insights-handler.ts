import * as vscode from "vscode";
import {EngineInsight} from "./code-analyzer";
import {Display, DisplayButton} from "./display";
import {Logger} from "./logger";
import {messages} from "./messages";
import {ExternalServiceProvider} from "./external-services/external-service-provider";
import {WindowManager} from "./vscode-api";
import {CliCommandExecutor, CommandOutput} from "./cli-commands";

const ISSUES_URL = 'https://github.com/forcedotcom/sfdx-code-analyzer-vscode/issues/new';

type OrgInfo = {
    alias?: string;
    username?: string;
    isDefaultDevHubUsername?: boolean;
    defaultMarker?: string;
};

export class InsightsHandler {
    private readonly display: Display;
    private readonly logger: Logger;
    private readonly externalServiceProvider: ExternalServiceProvider;
    private readonly windowManager: WindowManager;
    private readonly cliCommandExecutor: CliCommandExecutor;
    private noOrgConnectionShown: boolean = false;

    constructor(display: Display, logger: Logger, externalServiceProvider: ExternalServiceProvider, windowManager: WindowManager, cliCommandExecutor: CliCommandExecutor) {
        this.display = display;
        this.logger = logger;
        this.externalServiceProvider = externalServiceProvider;
        this.windowManager = windowManager;
        this.cliCommandExecutor = cliCommandExecutor;
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

        switch (error.code) {
            case 'NO_ORG_CONNECTION':
                // Only show once per session (non-intrusive)
                if (!this.noOrgConnectionShown) {
                    this.noOrgConnectionShown = true;
                    this.handleNoOrgConnection(error.message, error.remediation);
                }
                break;
            case 'API_UNAVAILABLE':
                // Always show (transient error, might work on retry)
                this.handleApiUnavailable(error.message, error.remediation, retriggerScan);
                break;
            case 'UNEXPECTED_ERROR':
                // Always show (could be different errors)
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

    private triggerConnectOrg(_remediation: string): void {
        this.showOrgQuickPickOrLogin().catch(err => {
            this.logger.error(`Connect Org failed: ${err}`);
        });
    }

    private async showOrgQuickPickOrLogin(): Promise<void> {
        const orgs = await this.listAuthenticatedOrgs();

        if (orgs.length === 0) {
            // No authenticated orgs — open a terminal to login
            const terminal = vscode.window.createTerminal('Salesforce Org Login');
            terminal.show();
            terminal.sendText('sf org login web');
            return;
        }

        // Show QuickPick to select from existing authenticated orgs
        const items = orgs.map(org => ({
            label: org.alias ?? org.username ?? 'Unknown',
            description: org.username && org.alias ? org.username : undefined,
            detail: org.defaultMarker ? '(current default)' : undefined,
            orgAlias: org.alias ?? org.username
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: messages.insights.selectOrgPlaceholder,
            title: messages.insights.selectOrgTitle
        });

        if (selected?.orgAlias) {
            const result: CommandOutput = await this.cliCommandExecutor.exec('sf', ['config', 'set', `target-org=${selected.orgAlias}`]);
            if (result.exitCode === 0) {
                this.display.displayInfo(messages.insights.orgSetSuccess(selected.orgAlias));
                this.logger.log(`Default target-org set to: ${selected.orgAlias}`);
            } else {
                this.display.displayError(messages.insights.orgSetFailure(selected.orgAlias, result.stderr));
                this.logger.error(`Failed to set target-org: ${result.stderr}`);
            }
        }
    }

    private async listAuthenticatedOrgs(): Promise<OrgInfo[]> {
        try {
            const result: CommandOutput = await this.cliCommandExecutor.exec('sf', ['org', 'list', '--json']);
            if (result.exitCode !== 0) {
                this.logger.warn(`Failed to list orgs: ${result.stderr}`);
                return [];
            }

            const parsed = JSON.parse(result.stdout) as {
                result?: {
                    nonScratchOrgs?: Array<{alias?: string; username?: string; isDefaultUsername?: boolean}>;
                    scratchOrgs?: Array<{alias?: string; username?: string; isDefaultUsername?: boolean}>;
                }
            };

            const nonScratch = (parsed.result?.nonScratchOrgs ?? []).map(o => ({
                alias: o.alias,
                username: o.username,
                defaultMarker: o.isDefaultUsername ? '(default)' : undefined
            }));
            const scratch = (parsed.result?.scratchOrgs ?? []).map(o => ({
                alias: o.alias,
                username: o.username,
                defaultMarker: o.isDefaultUsername ? '(default)' : undefined
            }));

            return [...nonScratch, ...scratch];
        } catch (err) {
            this.logger.warn(`Error listing orgs: ${err}`);
            return [];
        }
    }
}
