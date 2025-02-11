import {CliScannerStrategy} from './scanner-strategy';
import { DiagnosticConvertible } from '../diagnostics';
import {messages} from '../messages';
import * as cspawn from 'cross-spawn';
import { tmpFileWithCleanup } from '../file';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type CliScannerV5StrategyOptions = {
	tags: string;
};

type ResultsJson = {
	runDir: string;
	violations: DiagnosticConvertible[];
};

// TODO: When v5 adds support for Graph Engine, we'll want to add its DFA rules to this array.
const POTENTIALLY_LONG_RUNNING_RULES: string[] = [];

export class CliScannerV5Strategy extends CliScannerStrategy {
	private readonly options: CliScannerV5StrategyOptions;

	public constructor(options: CliScannerV5StrategyOptions) {
		super();
		this.options = options;
	}

	protected override async validatePlugin(): Promise<void> {
		// @salesforce/plugin-code-analyzer is a JIT plugin, but the output format only stabilized
		// in the beta release, so we need to make sure that the beta release is either already installed,
		// or the version that will be installed via JIT installation.
		const codeAnalyzerIsInstalled: boolean = await new Promise((res) => {
			const cp = cspawn.spawn('sf', ['plugins']);

			let stdout = '';

			cp.stdout.on('data', data => {
				stdout += data;
			});

			cp.on('exit', code => {
				return res(code === 0 && stdout.includes('code-analyzer 5.0.0-beta'));
			});
		});
		if (!codeAnalyzerIsInstalled) {
			throw new Error(messages.error.codeAnalyzerMissing);
		}
	}

	public override async scan(targets: string[]): Promise<DiagnosticConvertible[]> {
		const potentiallyLongRunningRules: string[] = await this.getLongRunningRules();

		if (potentiallyLongRunningRules.length > 0) {
			await this.confirmPotentiallyLongRunningScan(potentiallyLongRunningRules);
		}

		const resultsJson: ResultsJson = await this.invokeAnalyzer(targets);

		return this.processResults(resultsJson);
	}

	private async getLongRunningRules(): Promise<string[]> {
		const args: string[] = [
			'code-analyzer', 'rules',
			'-r', this.options.tags
		];

		const output: string = await new Promise((res, rej) => {
			const cp = cspawn.spawn('sf', args);

			let stdout = '';
			let stderr = '';

			cp.stdout.on('data', data => {
				stdout += data;
			});

			cp.stderr.on('data', data => {
				stderr += data;
			});

			cp.on('exit', (status) => {
				if (status === 0) {
					return res(stdout);
				} else {
					return rej(stderr);
				}
			});
		});

		return POTENTIALLY_LONG_RUNNING_RULES.filter(r => output.includes(r));
	}

	private confirmPotentiallyLongRunningScan(_rules: string[]): Promise<boolean> {
		// TODO: When v5 adds support for Graph Engine, we'll want to implement the body of this method.
		// We could add a new method called `.confirm` to the `Display` class and pass an instance of that in
		// as part of the Options in the constructor, and then use that to prompt the user to confirm that they
		// actually want to run what could potentially be a pretty long-running scan.
		return Promise.resolve(true);
	}

	private async invokeAnalyzer(targets: string[]): Promise<ResultsJson> {
		const args: string[] = [
			'code-analyzer', 'run',
			'-r', this.options.tags,
			'-w', `"${targets.join('","')}"`
		];

		const outputFile: string = await tmpFileWithCleanup('.json');

		args.push('-f', outputFile);

		await new Promise<void>((res, rej) => {
			const cp = cspawn.spawn('sf', args);
			let stdout = '';
			let stderr = '';


			cp.stdout.on('data', data => {
				stdout += data;
			})
			cp.stderr.on('data', data => {
				stderr += data;
			});

			cp.on('exit', status => {
				if (status === 0) {
					res();
				} else {
					rej(stderr);
				}
			});
		});

		const outputString: string = await fs.promises.readFile(outputFile, 'utf-8');

		const outputJson: ResultsJson = JSON.parse(outputString) as ResultsJson;

		return outputJson;
	}

	private processResults(resultsJson: ResultsJson): DiagnosticConvertible[] {
		const processedConvertibles: DiagnosticConvertible[] = [];

		for (const violation of resultsJson.violations) {
			for (const location of violation.locations) {
				location.file = path.join(resultsJson.runDir, location.file);
			}
			processedConvertibles.push(violation);
		}
		return processedConvertibles;
	}
}
