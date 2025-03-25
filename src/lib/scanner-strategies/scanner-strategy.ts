import {Violation} from '../diagnostics';
import {SfCli} from '../sf-cli';
import {messages} from '../messages';


export abstract class ScannerStrategy {
    public abstract validateEnvironment(): Promise<void>;

    public abstract scan(filesToScan: string[]): Promise<Violation[]>;

    public abstract getScannerName(): string;
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
