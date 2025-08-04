import {Violation} from "./diagnostics";
import {CliScannerV5Strategy} from "./scanner-strategies/v5-scanner";
import {SettingsManager} from "./settings";
import {Display} from "./display";
import {messages} from './messages';
import {CliCommandExecutor} from "./cli-commands";
import * as semver from 'semver';
import {
    ABSOLUTE_MINIMUM_REQUIRED_CODE_ANALYZER_CLI_PLUGIN_VERSION,
    RECOMMENDED_MINIMUM_REQUIRED_CODE_ANALYZER_CLI_PLUGIN_VERSION
} from "./constants";
import {CliScannerStrategy} from "./scanner-strategies/scanner-strategy";
import {FileHandler, FileHandlerImpl} from "./fs-utils";
import {Workspace} from "./workspace";

export interface CodeAnalyzer extends CliScannerStrategy {
    validateEnvironment(): Promise<void>;
}

export class CodeAnalyzerImpl implements CodeAnalyzer {
    private readonly cliCommandExecutor: CliCommandExecutor;
    private readonly settingsManager: SettingsManager;
    private readonly display: Display;
    private readonly fileHandler: FileHandler

    private cliIsInstalled: boolean = false;

    private codeAnalyzerV5?: CliScannerV5Strategy;

    constructor(cliCommandExecutor: CliCommandExecutor, settingsManager: SettingsManager, display: Display,
                fileHandler: FileHandler = new FileHandlerImpl()) {
        this.cliCommandExecutor = cliCommandExecutor;
        this.settingsManager = settingsManager;
        this.display = display;
        this.fileHandler = fileHandler;
    }

    async validateEnvironment(): Promise<void> {
        if (!this.cliIsInstalled) {
            if (!(await this.cliCommandExecutor.isSfInstalled())) {
                throw new Error(messages.error.sfMissing);
            }
            this.cliIsInstalled = true;
        }
        await this.validateV5Plugin();
    }

    private async getDelegate(): Promise<CliScannerStrategy> {
        await this.validateEnvironment();
        return this.codeAnalyzerV5;
    }

    private async validateV5Plugin(): Promise<void> {
        if (this.codeAnalyzerV5 !== undefined) {
            return; // Already validated
        }
        const absMinVersion: semver.SemVer = new semver.SemVer(ABSOLUTE_MINIMUM_REQUIRED_CODE_ANALYZER_CLI_PLUGIN_VERSION);
        const recommendedMinVersion: semver.SemVer = new semver.SemVer(RECOMMENDED_MINIMUM_REQUIRED_CODE_ANALYZER_CLI_PLUGIN_VERSION);
        const installedVersion: semver.SemVer | undefined = await this.cliCommandExecutor.getSfCliPluginVersion('code-analyzer');
        if (!installedVersion) {
            throw new Error(messages.codeAnalyzer.codeAnalyzerMissing + '\n'
                + messages.codeAnalyzer.installLatestVersion);
        } else if (semver.lt(installedVersion, absMinVersion)) {
            throw new Error(messages.codeAnalyzer.doesNotMeetMinVersion(installedVersion.toString(), recommendedMinVersion.toString()) + '\n'
                + messages.codeAnalyzer.installLatestVersion);
        } else if (semver.lt(installedVersion, recommendedMinVersion)) {
            this.display.displayWarning(messages.codeAnalyzer.usingOlderVersion(installedVersion.toString(), recommendedMinVersion.toString()) + '\n'
                + messages.codeAnalyzer.installLatestVersion);
        }
        this.codeAnalyzerV5 = new CliScannerV5Strategy(installedVersion, this.cliCommandExecutor, this.settingsManager, this.fileHandler);
    }

    async scan(workspace: Workspace): Promise<Violation[]> {
        return (await this.getDelegate()).scan(workspace);
    }

    async getScannerName(): Promise<string> {
        return (await this.getDelegate()).getScannerName();
    }

    async getRuleDescriptionFor(engineName: string, ruleName: string): Promise<string> {
        return (await this.getDelegate()).getRuleDescriptionFor(engineName, ruleName);
    }
}
