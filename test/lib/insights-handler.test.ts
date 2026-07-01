import * as vscode from "vscode";
import {InsightsHandler} from "../../src/lib/insights-handler";
import {EngineInsight} from "../../src/lib/code-analyzer";
import {SpyDisplay, SpyLogger, SpyWindowManager} from "../stubs";
import {messages} from "../../src/lib/messages";
import {ExternalServiceProvider} from "../../src/lib/external-services/external-service-provider";

class StubExternalServiceProvider {
    isOrgConnectionServiceAvailableReturnValue: boolean = true;

    async isOrgConnectionServiceAvailable(): Promise<boolean> {
        return this.isOrgConnectionServiceAvailableReturnValue;
    }
}

describe('Tests for InsightsHandler', () => {
    let display: SpyDisplay;
    let logger: SpyLogger;
    let externalServiceProvider: StubExternalServiceProvider;
    let windowManager: SpyWindowManager;
    let insightsHandler: InsightsHandler;
    let retriggerScanCallCount: number;
    let retriggerScan: () => void;

    beforeEach(() => {
        display = new SpyDisplay();
        logger = new SpyLogger();
        externalServiceProvider = new StubExternalServiceProvider();
        windowManager = new SpyWindowManager();
        insightsHandler = new InsightsHandler(
            display, logger,
            externalServiceProvider as unknown as ExternalServiceProvider,
            windowManager
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

    it('After a banner is shown for an error code, the same code does not produce a banner again (session suppression)', () => {
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

    it('Different error codes are suppressed independently', () => {
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

        insightsHandler.handleInsights(noOrgInsights, retriggerScan);
        expect(display.displayInfoCallHistory).toHaveLength(1);

        // Same code suppressed
        insightsHandler.handleInsights(noOrgInsights, retriggerScan);
        expect(display.displayInfoCallHistory).toHaveLength(1);

        // Different code still shows
        insightsHandler.handleInsights(apiInsights, retriggerScan);
        expect(display.displayInfoCallHistory).toHaveLength(2);
    });

    it('Connect Org button triggers vscode.commands.executeCommand when Core Extension is available', async () => {
        externalServiceProvider.isOrgConnectionServiceAvailableReturnValue = true;

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

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('sfdx.authorize.org');
    });

    it('Connect Org button shows fallback message when Core Extension is NOT available', async () => {
        externalServiceProvider.isOrgConnectionServiceAvailableReturnValue = false;

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

        expect(display.displayInfoCallHistory).toHaveLength(2);
        expect(display.displayInfoCallHistory[1].msg).toContain('sf org login web');
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
