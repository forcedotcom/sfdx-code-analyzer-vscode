import {CliScannerStrategy} from './scanner-strategy';
import {Violation} from '../diagnostics';
import {tmpFileWithCleanup} from '../file';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as semver from 'semver';
import {SettingsManager} from "../settings";
import {CliCommandExecutor, CommandOutput} from "../cli-commands";

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

export class CliScannerV5Strategy implements CliScannerStrategy {
    private readonly version: semver.SemVer;
    private readonly cliCommandExecutor: CliCommandExecutor;
    private readonly settingsManager: SettingsManager;

    private ruleDescriptionMap?: Map<string, string>;

    public constructor(version: semver.SemVer, cliCommandExecutor: CliCommandExecutor, settingsManager: SettingsManager) {
        this.version = version;
        this.cliCommandExecutor = cliCommandExecutor;
        this.settingsManager = settingsManager;
    }

    public getScannerName(): Promise<string> {
        return Promise.resolve(`code-analyzer@${this.version.toString()} via CLI`);
    }

    public async getRuleDescriptionFor(engineName: string, ruleName: string): Promise<string> {
        return (await this.getRuleDescriptionMap()).get(`${engineName}:${ruleName}`) || '';
    }

    private async getRuleDescriptionMap(): Promise<Map<string, string>> {
        if (this.ruleDescriptionMap === undefined) {
            if (semver.gte(this.version, '5.0.0-beta.3')) {
                this.ruleDescriptionMap = await this.createRuleDescriptionMap();
            } else {
                this.ruleDescriptionMap = new Map();
            }
        }
        return this.ruleDescriptionMap;
    }

    public async scan(filesToScan: string[]): Promise<Violation[]> {
        const ruleSelector: string = this.settingsManager.getCodeAnalyzerRuleSelectors();
        const configFile: string = this.settingsManager.getCodeAnalyzerConfigFile();

        let args: string[] = [
            'code-analyzer', 'run',
            '-w', `"${filesToScan.join('","')}"`,
        ];
        if (ruleSelector) {
            args = [...args, '-r', ruleSelector];
        }
        if (configFile) {
            args = [...args, '-c', configFile];
        }

        const outputFile: string = await tmpFileWithCleanup('.json');
        args.push('-f', outputFile);

        const commandOutput: CommandOutput = await this.cliCommandExecutor.exec('sf', args);
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
        const outputFile: string = await tmpFileWithCleanup('.json');
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
