import {DiagnosticConvertible} from '../diagnostics';
import {SfCli} from '../sf-cli';
import {messages} from '../messages';


export abstract class ScannerStrategy {
	public abstract validateEnvironment(): Promise<void>;

	public abstract scan(targets: string[]): Promise<DiagnosticConvertible[]>;
}


export abstract class CliScannerStrategy extends ScannerStrategy {
	public override async validateEnvironment(): Promise<void> {
		if (!await SfCli.isSfCliInstalled()) {
			throw new Error(messages.error.sfMissing);
		}
		await this.validatePlugin();
	}

	protected abstract validatePlugin(): Promise<void>;
}


export class NoOpScannerStrategy extends ScannerStrategy {
	public override validateEnvironment(): Promise<void> {
		return Promise.resolve();
	}

	public override scan(_targets: string[]): Promise<DiagnosticConvertible[]> {
		const results: DiagnosticConvertible[] = [];
		return Promise.resolve(results);
	}
}


