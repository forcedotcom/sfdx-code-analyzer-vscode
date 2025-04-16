import {Violation} from "./diagnostics";
import {CliScannerV4Strategy} from "./scanner-strategies/v4-scanner";
import {CliScannerV5Strategy} from "./scanner-strategies/v5-scanner";
import {SettingsManager} from "./settings";
import {Display} from "./display";
import {messages} from './messages';
import {CliCommandExecutor, CommandOutput} from "./cli-commands";
import * as semver from 'semver';
import {getErrorMessageWithStack} from "./utils";
import {
    ABSOLUTE_MINIMUM_REQUIRED_CODE_ANALYZER_CLI_PLUGIN_VERSION,
    RECOMMENDED_MINIMUM_REQUIRED_CODE_ANALYZER_CLI_PLUGIN_VERSION
} from "./constants";
import {CliScannerStrategy} from "./scanner-strategies/scanner-strategy";

export interface CodeAnalyzer extends CliScannerStrategy {
    validateEnvironment(): Promise<void>;
}

export class CodeAnalyzerImpl implements CodeAnalyzer {
    private readonly cliCommandExecutor: CliCommandExecutor;
    private readonly settingsManager: SettingsManager;
    private readonly display: Display;

    private cliIsInstalled: boolean = false;

    private codeAnalyzerV4?: CliScannerV4Strategy;
    private codeAnalyzerV5?: CliScannerV5Strategy;

    constructor(cliCommandExecutor: CliCommandExecutor, settingsManager: SettingsManager, display: Display) {
        this.cliCommandExecutor = cliCommandExecutor;
        this.settingsManager = settingsManager;
        this.display = display;
    }

    async validateEnvironment(): Promise<void> {
        if (!this.cliIsInstalled) {
            const commandOutput: CommandOutput = await this.cliCommandExecutor.exec('sf', ['--version']);
            if (commandOutput.exitCode !== 0) {
                throw new Error(messages.error.sfMissing);
            }
            this.cliIsInstalled = true;
        }
        if (this.settingsManager.getCodeAnalyzerUseV4Deprecated()) {
            await this.validateV4Plugin();
        } else {
            await this.validateV5Plugin();
        }
    }

    private async getDelegate(): Promise<CliScannerStrategy> {
        await this.validateEnvironment();
        return this.settingsManager.getCodeAnalyzerUseV4Deprecated() ? this.codeAnalyzerV4 : this.codeAnalyzerV5;
    }

    private async validateV4Plugin(): Promise<void> {
        if (this.codeAnalyzerV4 !== undefined) {
            return; // Already validated
        }
        // Even though v4 is a JIT plugin... in the future it might not be. So we validate for future proofing.
        const installedVersion: semver.SemVer | undefined = await this.fetchPluginVersion('@salesforce/sfdx-scanner');
        if (!installedVersion) {
            throw new Error(messages.error.sfdxScannerMissing);
        }
        this.codeAnalyzerV4 = new CliScannerV4Strategy(installedVersion, this.cliCommandExecutor, this.settingsManager);
    }

    private async validateV5Plugin(): Promise<void> {
        if (this.codeAnalyzerV5 !== undefined) {
            return; // Already validated
        }
        const absMinVersion: semver.SemVer = new semver.SemVer(ABSOLUTE_MINIMUM_REQUIRED_CODE_ANALYZER_CLI_PLUGIN_VERSION);
        const recommendedMinVersion: semver.SemVer = new semver.SemVer(RECOMMENDED_MINIMUM_REQUIRED_CODE_ANALYZER_CLI_PLUGIN_VERSION);
        const installedVersion: semver.SemVer | undefined = await this.fetchPluginVersion('code-analyzer');
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
        this.codeAnalyzerV5 = new CliScannerV5Strategy(installedVersion, this.cliCommandExecutor, this.settingsManager);
    }

    async scan(filesToScan: string[]): Promise<Violation[]> {
        return (await this.getDelegate()).scan(filesToScan);
    }

    async getScannerName(): Promise<string> {
        return (await this.getDelegate()).getScannerName();
    }

    async getRuleDescriptionFor(engineName: string, ruleName: string): Promise<string> {
        return (await this.getDelegate()).getRuleDescriptionFor(engineName, ruleName);
    }

    private async fetchPluginVersion(pluginName: string): Promise<semver.SemVer | undefined> {
        const args: string[] = ['plugins', 'inspect', pluginName, '--json'];
        const commandOutput: CommandOutput = await this.cliCommandExecutor.exec('sf', args);
        if (commandOutput.exitCode === 0) {
            try {
                const pluginMetadata: {version: string}[] = JSON.parse(commandOutput.stdout) as {version: string}[];
                if (Array.isArray(pluginMetadata) && pluginMetadata.length === 1 && pluginMetadata[0].version) {
                    return new semver.SemVer(pluginMetadata[0].version);
                }
            } catch (err) { // Sanity check. Ideally this should never happen:
                throw new Error(`Error thrown when processing the output: sf ${args.join(' ')}\n\n` +
                    `==Error==\n${getErrorMessageWithStack(err)}\n\n==StdOut==\n${commandOutput.stdout}`);
            }
        }
        return undefined;
    }
}
