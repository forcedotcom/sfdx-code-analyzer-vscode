import * as vscode from "vscode";
import {InsightsHandler} from "../../src/lib/insights-handler";
import {EngineInsight} from "../../src/lib/code-analyzer";
import {SpyDisplay, SpyLogger, SpyWindowManager} from "../stubs";
import {messages} from "../../src/lib/messages";
import {ExternalServiceProvider} from "../../src/lib/external-services/external-service-provider";
import {CliCommandExecutor, CommandOutput} from "../../src/lib/cli-commands";
import * as semver from "semver";

class StubExternalServiceProvider {
    isOrgConnectionServiceAvailableReturnValue: boolean = true;

    async isOrgConnectionServiceAvailable(): Promise<boolean> {
        return this.isOrgConnectionServiceAvailableReturnValue;
    }
}

class StubCliCommandExecutor implements CliCommandExecutor {
    execHistory: {command: string; args: string[]}[] = [];
    execReturnValue: CommandOutput = {stdout: '', stderr: '', exitCode: 0};

    async isSfInstalled(): Promise<boolean> {
        return true;
    }

    async getSfCliPluginVersion(_pluginName: string): Promise<semver.SemVer | undefined> {
        return undefined;
    }

    async exec(command: string, args: string[]): Promise<CommandOutput> {
        this.execHistory.push({command, args});
        return this.execReturnValue;
    }
}

describe('Tests for InsightsHandler', () => {
    let display: SpyDisplay;
    let logger: SpyLogger;
    let externalServiceProvider: StubExternalServiceProvider;
    let windowManager: SpyWindowManager;
    let cliCommandExecutor: StubCliCommandExecutor;
    let insightsHandler: InsightsHandler;
    let retriggerScanCallCount: number;
    let retriggerScan: () => void;

    beforeEach(() => {
        display = new SpyDisplay();
        logger = new SpyLogger();
        externalServiceProvider = new StubExternalServiceProvider();
        windowManager = new SpyWindowManager();
        cliCommandExecutor = new StubCliCommandExecutor();
        insightsHandler = new InsightsHandler(
            display, logger,
            externalServiceProvider as unknown as ExternalServiceProvider,
            windowManager,
            cliCommandExecutor
        );
        retriggerScanCallCount = 0;
        retriggerScan = () => { retriggerScanCallCount++; };
    });

    it('When insights is undefined, then no banner is shown', () => {
        insightsHandler.handleInsights(undefined, retriggerScan);
        expect(display.displayInfoCallHistory).toHaveLength(0);
    });

    it('When insights has no apexguru key, then no banner is shown', () => {
        const insights: Record<string, EngineInsight> = {
            pmd: {status: 'completed'}
        };
        insightsHandler.handleInsights(insights, retriggerScan);
        expect(display.displayInfoCallHistory).toHaveLength(0);
    });

    it('When apexguru status is completed, then no banner is shown', () => {
        const insights: Record<string, EngineInsight> = {
            apexguru: {status: 'completed'}
        };
        insightsHandler.handleInsights(insights, retriggerScan);
        expect(display.displayInfoCallHistory).toHaveLength(0);
    });

    it('When apexguru status is skipped with NO_ORG_CONNECTION, then info banner is shown with Connect Org button', () => {
        const insights: Record<string, EngineInsight> = {
            apexguru: {
                status: 'skipped',
                error: {
                    code: 'NO_ORG_CONNECTION',
                    message: 'No org connected',
                    remediation: 'sf org login web'
                }
            }
        };

        insightsHandler.handleInsights(insights, retriggerScan);

        expect(display.displayInfoCallHistory).toHaveLength(1);
        expect(display.displayInfoCallHistory[0].msg).toContain('no org is connected');
        expect(display.displayInfoCallHistory[0].buttons).toHaveLength(1);
        expect(display.displayInfoCallHistory[0].buttons[0].text).toEqual(messages.insights.buttons.connectOrg);
    });

    it('When apexguru status is skipped with API_UNAVAILABLE, then info banner is shown with Retry Scan and Details buttons', () => {
        const insights: Record<string, EngineInsight> = {
            apexguru: {
                status: 'skipped',
                error: {
                    code: 'API_UNAVAILABLE',
                    message: 'Service temporarily down',
                    remediation: 'Try again later'
                }
            }
        };

        insightsHandler.handleInsights(insights, retriggerScan);

        expect(display.displayInfoCallHistory).toHaveLength(1);
        expect(display.displayInfoCallHistory[0].msg).toContain('service is currently unavailable');
        expect(display.displayInfoCallHistory[0].buttons).toHaveLength(2);
        expect(display.displayInfoCallHistory[0].buttons[0].text).toEqual(messages.insights.buttons.retryScan);
        expect(display.displayInfoCallHistory[0].buttons[1].text).toEqual(messages.insights.buttons.details);
    });

    it('When apexguru status is skipped with UNEXPECTED_ERROR, then info banner is shown with View Details and Report Issue buttons', () => {
        const insights: Record<string, EngineInsight> = {
            apexguru: {
                status: 'skipped',
                error: {
                    code: 'UNEXPECTED_ERROR',
                    message: 'Something went wrong',
                    remediation: 'Contact support'
                }
            }
        };

        insightsHandler.handleInsights(insights, retriggerScan);

        expect(display.displayInfoCallHistory).toHaveLength(1);
        expect(display.displayInfoCallHistory[0].msg).toContain('unexpected error');
        expect(display.displayInfoCallHistory[0].buttons).toHaveLength(2);
        expect(display.displayInfoCallHistory[0].buttons[0].text).toEqual(messages.insights.buttons.viewDetails);
        expect(display.displayInfoCallHistory[0].buttons[1].text).toEqual(messages.insights.buttons.reportIssue);
    });

    it('NO_ORG_CONNECTION is shown once per session (non-intrusive)', () => {
        const insights: Record<string, EngineInsight> = {
            apexguru: {
                status: 'skipped',
                error: {
                    code: 'NO_ORG_CONNECTION',
                    message: 'No org connected',
                    remediation: 'sf org login web'
                }
            }
        };

        insightsHandler.handleInsights(insights, retriggerScan);
        expect(display.displayInfoCallHistory).toHaveLength(1);

        insightsHandler.handleInsights(insights, retriggerScan);
        expect(display.displayInfoCallHistory).toHaveLength(1); // Still 1, suppressed
    });

    it('API_UNAVAILABLE is shown every time (transient error)', () => {
        const apiInsights: Record<string, EngineInsight> = {
            apexguru: {
                status: 'skipped',
                error: {
                    code: 'API_UNAVAILABLE',
                    message: 'Service down',
                    remediation: 'Retry later'
                }
            }
        };

        insightsHandler.handleInsights(apiInsights, retriggerScan);
        expect(display.displayInfoCallHistory).toHaveLength(1);

        // API_UNAVAILABLE shows again (not suppressed)
        insightsHandler.handleInsights(apiInsights, retriggerScan);
        expect(display.displayInfoCallHistory).toHaveLength(2);

        // And again
        insightsHandler.handleInsights(apiInsights, retriggerScan);
        expect(display.displayInfoCallHistory).toHaveLength(3);
    });

    it('UNEXPECTED_ERROR is shown every time', () => {
        const unexpectedInsights: Record<string, EngineInsight> = {
            apexguru: {
                status: 'skipped',
                error: {
                    code: 'UNEXPECTED_ERROR',
                    message: 'Something went wrong',
                    remediation: 'Check logs'
                }
            }
        };

        insightsHandler.handleInsights(unexpectedInsights, retriggerScan);
        expect(display.displayInfoCallHistory).toHaveLength(1);

        // UNEXPECTED_ERROR shows again (not suppressed)
        insightsHandler.handleInsights(unexpectedInsights, retriggerScan);
        expect(display.displayInfoCallHistory).toHaveLength(2);
    });

    it('NO_ORG_CONNECTION suppression does not affect other error codes', () => {
        const noOrgInsights: Record<string, EngineInsight> = {
            apexguru: {
                status: 'skipped',
                error: {
                    code: 'NO_ORG_CONNECTION',
                    message: 'No org',
                    remediation: 'sf org login web'
                }
            }
        };
        const apiInsights: Record<string, EngineInsight> = {
            apexguru: {
                status: 'skipped',
                error: {
                    code: 'API_UNAVAILABLE',
                    message: 'Service down',
                    remediation: 'Retry later'
                }
            }
        };

        // Show NO_ORG_CONNECTION once
        insightsHandler.handleInsights(noOrgInsights, retriggerScan);
        expect(display.displayInfoCallHistory).toHaveLength(1);

        // NO_ORG_CONNECTION suppressed
        insightsHandler.handleInsights(noOrgInsights, retriggerScan);
        expect(display.displayInfoCallHistory).toHaveLength(1);

        // API_UNAVAILABLE still shows
        insightsHandler.handleInsights(apiInsights, retriggerScan);
        expect(display.displayInfoCallHistory).toHaveLength(2);

        // API_UNAVAILABLE shows again
        insightsHandler.handleInsights(apiInsights, retriggerScan);
        expect(display.displayInfoCallHistory).toHaveLength(3);
    });

    it('Connect Org button opens terminal with sf org login web when no orgs are authenticated', async () => {
        // sf org list returns no orgs
        cliCommandExecutor.execReturnValue = {
            stdout: JSON.stringify({result: {nonScratchOrgs: [], scratchOrgs: []}}),
            stderr: '',
            exitCode: 0
        };

        const mockTerminal = {show: jest.fn(), sendText: jest.fn()};
        (vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal);

        const insights: Record<string, EngineInsight> = {
            apexguru: {
                status: 'skipped',
                error: {
                    code: 'NO_ORG_CONNECTION',
                    message: 'No org',
                    remediation: 'sf org login web'
                }
            }
        };

        insightsHandler.handleInsights(insights, retriggerScan);
        display.displayInfoCallHistory[0].buttons[0].callback();

        // Allow the async promise to resolve
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(vscode.window.createTerminal).toHaveBeenCalledWith('Salesforce Org Login');
        expect(mockTerminal.show).toHaveBeenCalled();
        expect(mockTerminal.sendText).toHaveBeenCalledWith('sf org login web');
    });

    it('Connect Org button shows QuickPick when orgs are already authenticated', async () => {
        // sf org list returns some orgs
        cliCommandExecutor.execReturnValue = {
            stdout: JSON.stringify({
                result: {
                    nonScratchOrgs: [
                        {alias: 'myOrg', username: 'user@example.com', isDefaultUsername: false}
                    ],
                    scratchOrgs: []
                }
            }),
            stderr: '',
            exitCode: 0
        };

        const insights: Record<string, EngineInsight> = {
            apexguru: {
                status: 'skipped',
                error: {
                    code: 'NO_ORG_CONNECTION',
                    message: 'No org',
                    remediation: 'sf org login web'
                }
            }
        };

        insightsHandler.handleInsights(insights, retriggerScan);
        display.displayInfoCallHistory[0].buttons[0].callback();

        // Allow the async promise to resolve
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(vscode.window.showQuickPick).toHaveBeenCalled();
    });

    it('Connect Org button sets target-org when user selects an org from QuickPick', async () => {
        // sf org list returns some orgs
        cliCommandExecutor.execReturnValue = {
            stdout: JSON.stringify({
                result: {
                    nonScratchOrgs: [
                        {alias: 'myOrg', username: 'user@example.com', isDefaultUsername: false}
                    ],
                    scratchOrgs: []
                }
            }),
            stderr: '',
            exitCode: 0
        };

        // Mock showQuickPick to simulate user selection
        (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce({
            label: 'myOrg',
            description: 'user@example.com',
            orgAlias: 'myOrg'
        });

        const insights: Record<string, EngineInsight> = {
            apexguru: {
                status: 'skipped',
                error: {
                    code: 'NO_ORG_CONNECTION',
                    message: 'No org',
                    remediation: 'sf org login web'
                }
            }
        };

        insightsHandler.handleInsights(insights, retriggerScan);
        display.displayInfoCallHistory[0].buttons[0].callback();

        // Allow the async promises to resolve
        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify sf config set was called
        const configSetCall = cliCommandExecutor.execHistory.find(
            call => call.args.includes('config') && call.args.includes('set')
        );
        expect(configSetCall).toBeDefined();
        expect(configSetCall.args).toContain('target-org=myOrg');
    });

    it('Retry Scan button re-triggers the scan', () => {
        const insights: Record<string, EngineInsight> = {
            apexguru: {
                status: 'skipped',
                error: {
                    code: 'API_UNAVAILABLE',
                    message: 'Service down',
                    remediation: 'Retry later'
                }
            }
        };

        insightsHandler.handleInsights(insights, retriggerScan);
        display.displayInfoCallHistory[0].buttons[0].callback();

        expect(retriggerScanCallCount).toEqual(1);
    });

    it('View Details button shows log output window', () => {
        const insights: Record<string, EngineInsight> = {
            apexguru: {
                status: 'skipped',
                error: {
                    code: 'UNEXPECTED_ERROR',
                    message: 'Something went wrong',
                    remediation: 'Contact support'
                }
            }
        };

        insightsHandler.handleInsights(insights, retriggerScan);
        display.displayInfoCallHistory[0].buttons[0].callback();

        expect(windowManager.showLogOutputWindowCallCount).toEqual(1);
    });

    it('When apexguru insight has analysisMode without a skip error, then handler shows no banner (analysis mode is embedded in scan-complete message elsewhere)', () => {
        const insights: Record<string, EngineInsight> = {
            apexguru: {status: 'completed', analysisMode: 'full'}
        };

        insightsHandler.handleInsights(insights, retriggerScan);

        expect(display.displayInfoCallHistory).toHaveLength(0);
    });

    it('Report Issue button opens issues URL', () => {
        const insights: Record<string, EngineInsight> = {
            apexguru: {
                status: 'skipped',
                error: {
                    code: 'UNEXPECTED_ERROR',
                    message: 'Something went wrong',
                    remediation: 'Contact support'
                }
            }
        };

        insightsHandler.handleInsights(insights, retriggerScan);
        display.displayInfoCallHistory[0].buttons[1].callback();

        expect(windowManager.showExternalUrlCallHistory).toHaveLength(1);
        expect(windowManager.showExternalUrlCallHistory[0].url).toContain('github.com/forcedotcom/sfdx-code-analyzer-vscode/issues');
    });
});
