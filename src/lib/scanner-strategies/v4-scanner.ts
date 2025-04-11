import {CliScannerStrategy} from './scanner-strategy';
import {Violation} from '../diagnostics';
import {exists} from '../file';
import {messages} from '../messages';
import * as cspawn from 'cross-spawn';
import {SettingsManager} from "../settings";

export type BaseV4Violation = {
    ruleName: string;
    message: string;
    severity: number;
    normalizedSeverity?: number;
    category: string;
    url?: string;
    exception?: boolean;
};

export type PathlessV4RuleViolation = BaseV4Violation & {
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
};

export type DfaV4RuleViolation = BaseV4Violation & {
    sourceLine: number;
    sourceColumn: number;
    sourceType: string;
    sourceMethodName: string;
    sinkLine: number|null;
    sinkColumn: number|null;
    sinkFileName: string|null;
};

export type V4RuleViolation = PathlessV4RuleViolation | DfaV4RuleViolation;

export type V4RuleResult = {
    engine: string;
    fileName: string;
    violations: V4RuleViolation[];
};

export type V4ExecutionResult = {
    status: number;
    result?: V4RuleResult[]|string;
    warnings?: string[];
    message?: string;
};

export class CliScannerV4Strategy extends CliScannerStrategy {
    private readonly settingsManager: SettingsManager;
    private readonly name: string = '@salesforce/sfdx-scanner@^4 via CLI';

    public constructor(settingsManager: SettingsManager) {
        super();
        this.settingsManager = settingsManager;
    }

    public override getScannerName(): string {
        return this.name;
    }

    protected override validatePlugin(): Promise<void> {
        // @salesforce/sfdx-scanner is a JIT Plugin, so it will be installed automatically
        // if it's not already. So no action is needed.
        return Promise.resolve();
    }

    public override async scan(filesToScan: string[]): Promise<Violation[]> {
        // Create the arg array.
        const args: string[] = await this.createArgArray(filesToScan);

        // Invoke the scanner.
        const executionResult: V4ExecutionResult = await this.invokeAnalyzer(args);

        // Process the results.
        return this.processResults(executionResult);
    }

    private async createArgArray(targets: string[]): Promise<string[]> {
        const engines: string = this.settingsManager.getEnginesToRun();
        const pmdCustomConfigFile: string | undefined = this.settingsManager.getPmdCustomConfigFile();
        const rulesCategory: string | undefined = this.settingsManager.getRulesCategory();
        const normalizeSeverity: boolean = this.settingsManager.getNormalizeSeverityEnabled();

        if (engines.length === 0) {
            throw new Error('"Code Analyzer > Scanner: Engines" setting can\'t be empty. Go to your VS Code settings and specify at least one engine, and then try again.');
        }

        const args: string[] = [
            'scanner', 'run',
            '--target', `${targets.join(',')}`,
            `--engine`, engines,
            `--json`
        ];
        if (pmdCustomConfigFile?.length > 0) {
            if (!(await exists(pmdCustomConfigFile))) {
                throw new Error(messages.error.pmdConfigNotFoundGenerator(pmdCustomConfigFile));
            }
            args.push('--pmdconfig', pmdCustomConfigFile);
        }

        if (rulesCategory) {
            args.push('--category', rulesCategory);
        }

        if (normalizeSeverity) {
            args.push('--normalize-severity');
        }
        return args;
    }

    public getRuleDescriptionFor(_engineName: string, _ruleName: string): Promise<string> {
        // Currently the rule descriptions are nice-to-have to help provide additional context for A4D.
        // So for users still using v4, we don't really need to fill this in. We want users to migrate to v5 anyway.
        return Promise.resolve('');
    }

    private async invokeAnalyzer(args: string[]): Promise<V4ExecutionResult> {
        return new Promise((res) => {
            const cp = cspawn.spawn('sf', args);

            let stdout = '';

            cp.stdout.on('data', data => {
                stdout += data;
            });

            cp.on('exit', () => {
                // No matter what, stdout will be an execution result.
                res(JSON.parse(stdout) as V4ExecutionResult);
            });
        });
    }

    private processResults(executionResult: V4ExecutionResult): Violation[] {
        // 0 is the status code for a successful analysis.
        if (executionResult.status === 0) {
            // If the results were a string, that indicates that no results were found.
            if (typeof executionResult.result === 'string') {
                return [];
            } else {
                const convertedResults: Violation[] = [];
                for (const {engine, fileName, violations} of executionResult.result) {
                    for (const violation of violations) {
                        const pathlessViolation: PathlessV4RuleViolation = violation as PathlessV4RuleViolation;
                        convertedResults.push({
                            rule: pathlessViolation.ruleName,
                            engine,
                            message: pathlessViolation.message,
                            severity: pathlessViolation.severity,
                            locations: [{
                                file: fileName,
                                startLine: pathlessViolation.line,
                                startColumn: pathlessViolation.column,
                                endLine: pathlessViolation.endLine,
                                endColumn: pathlessViolation.endColumn,
                            }],
                            primaryLocationIndex: 0,
                            resources: pathlessViolation.url ? [pathlessViolation.url] : []
                        });
                    }
                }
                return convertedResults;
            }
        } else {
            // Any other status code indicates an error of some kind.
            throw new Error(executionResult.message);
        }
    }
}

