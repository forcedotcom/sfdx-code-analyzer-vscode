import {CliScannerStrategy} from './scanner-strategy';
import {Violation} from '../diagnostics';
import {messages} from '../messages';
import * as cspawn from 'cross-spawn';
import {tmpFileWithCleanup} from '../file';
import {stripAnsi} from '../string-utils';
import {CODE_ANALYZER_V5_ALPHA_TEMPLATE, CODE_ANALYZER_V5_TEMPLATE} from '../constants';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type CliScannerV5StrategyOptions = {
    ruleSelector: string;
    configFile: string;
};

type ResultsJson = {
    runDir: string;
    violations: Violation[];
};

export class CliScannerV5Strategy extends CliScannerStrategy {
    private readonly options: CliScannerV5StrategyOptions;
    private readonly name: string = '@salesforce/plugin-code-analyzer@^5 via CLI';
    private codeAnalyzerIsInstalled?: boolean;

    public constructor(options: CliScannerV5StrategyOptions) {
        super();
        this.options = options;
    }

    public override getScannerName(): string {
        return this.name;
    }

    protected override async validatePlugin(): Promise<void> {
        // TODO: In the future, we might remove this validation step since code-analyzer is a JIT plugin. But we'll
        //       leave it for a few releases while code-analyzer v5 stabilizes.
        if (this.codeAnalyzerIsInstalled) {
            return; // We do not continue to validate if we have passed validation at least once.
        }
        this.codeAnalyzerIsInstalled = await new Promise((res) => {
            const cp = cspawn.spawn('sf', ['plugins']);
            let stdout = '';

            cp.stdout.on('data', data => {
                stdout += data;
            });

            cp.on('exit', code => {
                const output: string = stripAnsi(stdout);
                // @salesforce/plugin-code-analyzer is a JIT plugin, but the output format was not stabilized in the
                // alpha release, so we need to make sure that the isn't using an alpha release.
                return res(code === 0 && output.includes(CODE_ANALYZER_V5_TEMPLATE) && !output.includes(CODE_ANALYZER_V5_ALPHA_TEMPLATE));
            });
        });
        if (!this.codeAnalyzerIsInstalled) {
            throw new Error(messages.error.codeAnalyzerMissing);
        }
    }

    public override async scan(filesToScan: string[]): Promise<Violation[]> {
        const resultsJson: ResultsJson = await this.invokeAnalyzer(filesToScan);

        return this.processResults(resultsJson);
    }

    private async invokeAnalyzer(targets: string[]): Promise<ResultsJson> {
        let args: string[] = [
            'code-analyzer', 'run',
            '-w', `"${targets.join('","')}"`,
        ];
        if (this.options.ruleSelector) {
            args = [...args, '-r', this.options.ruleSelector];
        }
        if (this.options.configFile) {
            args = [...args, '-c', this.options.configFile];
        }

        const outputFile: string = await tmpFileWithCleanup('.json');

        args.push('-f', outputFile);

        await new Promise<void>((res, rej) => {
            const cp = cspawn.spawn('sf', args);
            let stderr = '';

            cp.stderr.on('data', data => {
                stderr += data;
            });

            cp.on('exit', status => {
                if (status === 0) {
                    res();
                } else {
                    rej(new Error(stderr));
                }
            });
        });

        const outputString: string = await fs.promises.readFile(outputFile, 'utf-8');

        return JSON.parse(outputString) as ResultsJson;
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
}
