import * as vscode from "vscode";
import {InsightsHandler} from "../../src/lib/insights-handler";
import {CodeAnalyzerRunAction} from "../../src/lib/code-analyzer-run-action";
import {EngineInsight, ScanResults} from "../../src/lib/code-analyzer";
import {
    FakeTaskWithProgressRunner,
    SpyDisplay,
    SpyLogger,
    SpyTelemetryService,
    SpyWindowManager,
    StubCodeAnalyzer,
    StubFileHandler,
    StubSettingsManager,
    StubVscodeWorkspace
} from "../stubs";
import {DiagnosticManager, DiagnosticManagerImpl} from "../../src/lib/diagnostics";
import {FakeDiagnosticCollection} from "../vscode-stubs";
import {ExternalServiceProvider} from "../../src/lib/external-services/external-service-provider";
import {Workspace} from "../../src/lib/workspace";
import {messages} from "../../src/lib/messages";

class StubExternalServiceProvider {
    isOrgConnectionServiceAvailableReturnValue: boolean = true;

    async isOrgConnectionServiceAvailable(): Promise<boolean> {
        return this.isOrgConnectionServiceAvailableReturnValue;
    }
}

describe('InsightsHandler integration tests - full skip-banner lifecycle', () => {
    let display: SpyDisplay;
    let logger: SpyLogger;
    let windowManager: SpyWindowManager;
    let externalServiceProvider: StubExternalServiceProvider;
    let codeAnalyzer: StubCodeAnalyzer;
    let codeAnalyzerRunAction: CodeAnalyzerRunAction;
    let sampleWorkspace: Workspace;

    beforeEach(async () => {
        display = new SpyDisplay();
        logger = new SpyLogger();
        windowManager = new SpyWindowManager();
        externalServiceProvider = new StubExternalServiceProvider();
        codeAnalyzer = new StubCodeAnalyzer();

        const taskWithProgressRunner = new FakeTaskWithProgressRunner();
        const diagnosticCollection = new FakeDiagnosticCollection();
        const settingsManager = new StubSettingsManager();
        const diagnosticManager: DiagnosticManager = new DiagnosticManagerImpl(diagnosticCollection, settingsManager);
        const diagnosticFactory = (diagnosticManager as DiagnosticManagerImpl).diagnosticFactory;
        const telemetryService = new SpyTelemetryService();

        const insightsHandler = new InsightsHandler(
            display, logger,
            externalServiceProvider as unknown as ExternalServiceProvider,
            windowManager
        );

        codeAnalyzerRunAction = new CodeAnalyzerRunAction(
            taskWithProgressRunner, codeAnalyzer, diagnosticManager,
            diagnosticFactory, telemetryService, logger, display, windowManager, insightsHandler
        );

        sampleWorkspace = await Workspace.fromTargetPaths(['someFile.cls'], new StubVscodeWorkspace(), new StubFileHandler());
    });

    it('CLI returns with insights.apexguru.status=skipped and error.code=NO_ORG_CONNECTION -> info banner appears with Connect Org button', async () => {
        codeAnalyzer.scanInsightsReturnValue = {
            apexguru: {
                status: 'skipped',
                error: {code: 'NO_ORG_CONNECTION', message: 'No org connected', remediation: 'sf org login web'}
            }
        };

        await codeAnalyzerRunAction.run('dummyCommandName', sampleWorkspace);

        const infoBanners = display.displayInfoCallHistory.filter(h => h.buttons.length > 0);
        expect(infoBanners).toHaveLength(1);
        expect(infoBanners[0].msg).toContain('no org is connected');
        expect(infoBanners[0].buttons[0].text).toEqual(messages.insights.buttons.connectOrg);
    });

    it('User dismisses banner -> same error code suppressed on next scan', async () => {
        codeAnalyzer.scanInsightsReturnValue = {
            apexguru: {
                status: 'skipped',
                error: {code: 'NO_ORG_CONNECTION', message: 'No org', remediation: 'sf org login web'}
            }
        };

        await codeAnalyzerRunAction.run('dummyCommandName', sampleWorkspace);
        const firstBannerCount = display.displayInfoCallHistory.filter(h => h.buttons.length > 0).length;
        expect(firstBannerCount).toEqual(1);

        // Run scan again - should be suppressed
        await codeAnalyzerRunAction.run('dummyCommandName', sampleWorkspace);
        const secondBannerCount = display.displayInfoCallHistory.filter(h => h.buttons.length > 0).length;
        expect(secondBannerCount).toEqual(1); // Still 1, suppressed
    });

    it('Different error code API_UNAVAILABLE still shows banner after NO_ORG_CONNECTION suppressed', async () => {
        codeAnalyzer.scanInsightsReturnValue = {
            apexguru: {
                status: 'skipped',
                error: {code: 'NO_ORG_CONNECTION', message: 'No org', remediation: 'sf org login web'}
            }
        };
        await codeAnalyzerRunAction.run('dummyCommandName', sampleWorkspace);

        // Change to API_UNAVAILABLE
        codeAnalyzer.scanInsightsReturnValue = {
            apexguru: {
                status: 'skipped',
                error: {code: 'API_UNAVAILABLE', message: 'Service down', remediation: 'Retry'}
            }
        };
        await codeAnalyzerRunAction.run('dummyCommandName', sampleWorkspace);

        const banners = display.displayInfoCallHistory.filter(h => h.buttons.length > 0);
        expect(banners).toHaveLength(2); // Both shown
        expect(banners[0].buttons[0].text).toEqual(messages.insights.buttons.connectOrg);
        expect(banners[1].buttons[0].text).toEqual(messages.insights.buttons.retryScan);
    });

    it('CLI returns without insights field (older CLI version) -> no crash, no banner, scan completes normally', async () => {
        codeAnalyzer.scanInsightsReturnValue = undefined;

        await codeAnalyzerRunAction.run('dummyCommandName', sampleWorkspace);

        const banners = display.displayInfoCallHistory.filter(h => h.buttons.length > 0);
        expect(banners).toHaveLength(0);
        // Scan completed normally - displayed results info
        expect(display.displayInfoCallHistory.some(h => h.msg.includes('Scan complete'))).toBe(true);
    });

    it('CLI returns with insights.apexguru.status=completed -> no banner', async () => {
        codeAnalyzer.scanInsightsReturnValue = {
            apexguru: {status: 'completed'}
        };

        await codeAnalyzerRunAction.run('dummyCommandName', sampleWorkspace);

        const banners = display.displayInfoCallHistory.filter(h => h.buttons.length > 0);
        expect(banners).toHaveLength(0);
    });

    it('User clicks Retry Scan -> scan re-triggers', async () => {
        codeAnalyzer.scanInsightsReturnValue = {
            apexguru: {
                status: 'skipped',
                error: {code: 'API_UNAVAILABLE', message: 'Service down', remediation: 'Retry'}
            }
        };

        await codeAnalyzerRunAction.run('dummyCommandName', sampleWorkspace);

        const banners = display.displayInfoCallHistory.filter(h => h.buttons.length > 0);
        expect(banners).toHaveLength(1);

        // Clear insights for next scan so we can detect it happened
        codeAnalyzer.scanInsightsReturnValue = undefined;

        // Click Retry Scan - the callback fires and forgets; give it a tick to complete
        banners[0].buttons[0].callback();
        await new Promise(resolve => setTimeout(resolve, 0));

        // Verify scan ran again (displayed results again)
        const scanCompleteMsgs = display.displayInfoCallHistory.filter(h => h.msg.includes('Scan complete'));
        expect(scanCompleteMsgs.length).toBeGreaterThanOrEqual(2);
    });
});
