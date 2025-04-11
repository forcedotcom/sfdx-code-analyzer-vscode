import {CliScannerStrategy} from './scanner-strategy';
import {Violation} from '../diagnostics';
import {messages} from '../messages';
import {tmpFileWithCleanup} from '../file';
import {
    ABSOLUTE_MINIMUM_REQUIRED_CODE_ANALYZER_CLI_PLUGIN_VERSION,
    RECOMMENDED_MINIMUM_REQUIRED_CODE_ANALYZER_CLI_PLUGIN_VERSION
} from '../constants';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {CommandOutput, execCommand} from "../command-executor";
import * as semver from 'semver';
import {getErrorMessageWithStack} from "../utils";
import {SettingsManager} from "../settings";

type ResultsJson = {
    runDir: string;
    violations: Violation[];
};

type RuleDescription = {
    name: string,
    description: string,
    engine: string,
    severity: number,
    tags: string[],
    resources: string[]
}

export class CliScannerV5Strategy extends CliScannerStrategy {
    private readonly name: string = '@salesforce/plugin-code-analyzer@^5 via CLI';
    private readonly settingsManager: SettingsManager;
    private installedCodeAnalyzerVersion?: semver.SemVer;
    private ruleDescriptionMap?: Map<string, string>;

    public constructor(settingsManager: SettingsManager) {
        super();
        this.settingsManager = settingsManager;
    }

    public override getScannerName(): string {
        return this.name;
    }

    protected override async validatePlugin(): Promise<void> {
        const absoluteMinVersion: semver.SemVer = new semver.SemVer(ABSOLUTE_MINIMUM_REQUIRED_CODE_ANALYZER_CLI_PLUGIN_VERSION);
        const recommendedMinVersion: semver.SemVer = new semver.SemVer(RECOMMENDED_MINIMUM_REQUIRED_CODE_ANALYZER_CLI_PLUGIN_VERSION);

        if (!this.installedCodeAnalyzerVersion) {
            this.installedCodeAnalyzerVersion = await getCodeAnalyzerCliVersion();
        }

        if (!this.installedCodeAnalyzerVersion) {
            throw new Error(messages.error.codeAnalyzerMissing);
        } else if (semver.lt(this.installedCodeAnalyzerVersion, absoluteMinVersion)) {
            throw new Error(
                messages.error.codeAnalyzerDoesNotMeetMinVersion(
                    this.installedCodeAnalyzerVersion.toString(),
                    absoluteMinVersion.toString()
                ) + '\n' + messages.error.codeAnalyzerMissing);
        } else if (semver.lt(this.installedCodeAnalyzerVersion, recommendedMinVersion)) {
            // TODO: Need to somehow throw warning
        }
    }

    public async getRuleDescriptionFor(engineName: string, ruleName: string): Promise<string> {
        if (this.ruleDescriptionMap === undefined) {
            await this.validatePlugin();
            await this.initRuleDescriptionMap();
        }
        return this.ruleDescriptionMap.get(`${engineName}:${ruleName}`) || '';
    }

    public override async scan(filesToScan: string[]): Promise<Violation[]> {
        const resultsJson: ResultsJson = await this.invokeAnalyzer(filesToScan);

        return this.processResults(resultsJson);
    }

    private async invokeAnalyzer(targets: string[]): Promise<ResultsJson> {
        const ruleSelector: string = this.settingsManager.getCodeAnalyzerRuleSelectors();
        const configFile: string = this.settingsManager.getCodeAnalyzerConfigFile();

        let args: string[] = [
            'code-analyzer', 'run',
            '-w', `"${targets.join('","')}"`,
        ];
        if (ruleSelector) {
            args = [...args, '-r', ruleSelector];
        }
        if (configFile) {
            args = [...args, '-c', configFile];
        }

        const outputFile: string = await tmpFileWithCleanup('.json');
        args.push('-f', outputFile);

        const commandOutput: CommandOutput = await execCommand('sf', args);
        if (commandOutput.exitCode !== 0) {
            throw new Error(commandOutput.stderr);
        }

        const resultsJsonStr: string = await fs.promises.readFile(outputFile, 'utf-8');
        return JSON.parse(resultsJsonStr) as ResultsJson;
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

    private async initRuleDescriptionMap(): Promise<void> {
        const outputFile: string = await tmpFileWithCleanup('.json');

        const commandOutput: CommandOutput = await execCommand('sf', ['code-analyzer', 'rules', '-r', 'all', '-f', outputFile]);
        if (commandOutput.exitCode !== 0) {
            throw new Error(commandOutput.stderr);
        }
        const rulesJsonStr: string = await fs.promises.readFile(outputFile, 'utf-8');
        const ruleDescriptions: RuleDescription[] = JSON.parse(rulesJsonStr) as RuleDescription[];

        this.ruleDescriptionMap = new Map();
        for (const ruleDescription of ruleDescriptions) {
            this.ruleDescriptionMap.set(`${ruleDescription.engine}:${ruleDescription.name}`, ruleDescription.description);
        }
    }
}



async function getCodeAnalyzerCliVersion(): Promise<semver.SemVer | undefined> {
    const args: string[] = ['plugins', 'inspect', '@salesforce/plugin-code-analyzer', '--json'];
    const commandOutput: CommandOutput = await execCommand('sf', args);
    if (commandOutput.exitCode === 0) {
        try {
            const pluginMetadata: {version: string}[] = JSON.parse(commandOutput.stdout) as {version: string}[];
            if (Array.isArray(pluginMetadata) && pluginMetadata.length === 1 && pluginMetadata[0].version) {
                return new semver.SemVer(pluginMetadata[0].version);
            }
        } catch (err) {
            throw new Error(`Error thrown when processing the output: sf ${args.join(' ')}\n\n` +
                `==Error==\n${getErrorMessageWithStack(err)}\n\n==StdOut==\n${commandOutput.stdout}`);
        }
    }
    return undefined;
}
