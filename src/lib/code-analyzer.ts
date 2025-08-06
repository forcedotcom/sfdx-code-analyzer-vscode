import {Violation} from "./diagnostics";
import {SettingsManager} from "./settings";
import {Display} from "./display";
import {messages} from './messages';
import {CliCommandExecutor, CommandOutput} from "./cli-commands";
import * as semver from 'semver';
import {
    ABSOLUTE_MINIMUM_REQUIRED_CODE_ANALYZER_CLI_PLUGIN_VERSION,
    RECOMMENDED_MINIMUM_REQUIRED_CODE_ANALYZER_CLI_PLUGIN_VERSION
} from "./constants";
import {FileHandler, FileHandlerImpl} from "./fs-utils";
import {Workspace} from "./workspace";
import * as vscode from "vscode";
import * as fs from 'node:fs';
import * as path from 'node:path';

type ResultsJson = {
    runDir: string;
    violations: Violation[];
};

type RulesJson = {
    rules: RuleDescription[];
}

type RuleDescription = {
    name: string,
    description: string,
    engine: string,
    severity: number,
    tags: string[],
    resources: string[]
}

export interface CodeAnalyzer {
    validateEnvironment(): Promise<void>;
    scan(workspace: Workspace): Promise<Violation[]>;
    getVersion(): Promise<string>;
    getRuleDescriptionFor(engineName: string, ruleName: string): Promise<string>;
}

export class CodeAnalyzerImpl implements CodeAnalyzer {
    private readonly cliCommandExecutor: CliCommandExecutor;
    private readonly settingsManager: SettingsManager;
    private readonly display: Display;
    private readonly fileHandler: FileHandler;

    private cliIsInstalled: boolean = false;
    private version?: semver.SemVer;
    private ruleDescriptionMap?: Map<string, string>;

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
        await this.validatePlugin();
    }

    private async validatePlugin(): Promise<void> {
        if (this.version !== undefined) {
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
        this.version = installedVersion;
    }

    public async getVersion(): Promise<string> {
        await this.validateEnvironment();
        return this.version?.toString() || 'unknown';
    }

    public async getRuleDescriptionFor(engineName: string, ruleName: string): Promise<string> {
        await this.validateEnvironment();
        return (await this.getRuleDescriptionMap()).get(`${engineName}:${ruleName}`) || '';
    }

    private async getRuleDescriptionMap(): Promise<Map<string, string>> {
        if (this.ruleDescriptionMap === undefined) {
            if (this.version && semver.gte(this.version, '5.0.0-beta.3')) {
                this.ruleDescriptionMap = await this.createRuleDescriptionMap();
            } else {
                this.ruleDescriptionMap = new Map();
            }
        }
        return this.ruleDescriptionMap;
    }

    public async scan(workspace: Workspace): Promise<Violation[]> {
        await this.validateEnvironment();
        
        const ruleSelector: string = this.settingsManager.getCodeAnalyzerRuleSelectors();
        const configFile: string = this.settingsManager.getCodeAnalyzerConfigFile();

        const args: string[] = ['code-analyzer', 'run'];

        if (this.version && semver.gte(this.version, '5.0.0')) {
            workspace.getRawWorkspacePaths().forEach(p => args.push('-w', p));
            workspace.getRawTargetPaths().forEach(p => args.push('-t', p));
        } else {
            // Before 5.0.0 the --target flag did not exist, so we just make the workspace equal to the target paths
            workspace.getRawTargetPaths().forEach(p => args.push('-w', p));
        }

        if (ruleSelector) {
            args.push('-r', ruleSelector);
        }
        if (configFile) {
            args.push('-c', configFile);
        }

        const outputFile: string = await this.fileHandler.createTempFile('.json');
        args.push('-f', outputFile);

        const commandOutput: CommandOutput = await this.cliCommandExecutor.exec('sf', args, {logLevel: vscode.LogLevel.Debug});
        if (commandOutput.exitCode !== 0) {
            throw new Error(commandOutput.stderr);
        }

        const resultsJsonStr: string = await fs.promises.readFile(outputFile, 'utf-8');
        const resultsJson: ResultsJson = JSON.parse(resultsJsonStr) as ResultsJson;
        return this.processResults(resultsJson);
    }

    private processResults(resultsJson: ResultsJson): Violation[] {
        const processedViolations: Violation[] = [];
        for (const violation of resultsJson.violations) {
            for (const location of violation.locations) {
                // If the path isn't already absolute, it needs to be made absolute.
                if (location.file && path.resolve(location.file).toLowerCase() !== location.file.toLowerCase()) {
                    // Relative paths are relative to the RunDir results property.
                    location.file = path.join(resultsJson.runDir, location.file);
                }
            }
            processedViolations.push(violation);
        }
        return processedViolations;
    }

    private async createRuleDescriptionMap(): Promise<Map<string, string>> {
        const outputFile: string = await this.fileHandler.createTempFile('.json');
        const commandOutput: CommandOutput = await this.cliCommandExecutor.exec('sf', ['code-analyzer', 'rules', '-r', 'all', '-f', outputFile]);
        if (commandOutput.exitCode !== 0) {
            throw new Error(commandOutput.stderr);
        }
        const rulesJsonStr: string = await fs.promises.readFile(outputFile, 'utf-8');
        const rulesOutput: RulesJson = JSON.parse(rulesJsonStr) as RulesJson;

        const ruleDescriptionMap: Map<string, string> = new Map();
        for (const ruleDescription of rulesOutput.rules) {
            ruleDescriptionMap.set(`${ruleDescription.engine}:${ruleDescription.name}`, ruleDescription.description);
        }
        return ruleDescriptionMap;
    }
}
