import {Violation} from '../diagnostics';
import {SfCli} from '../sf-cli';
import {messages} from '../messages';


export interface ScannerStrategy {
    validateEnvironment(): Promise<void>;

    scan(filesToScan: string[]): Promise<Violation[]>;

    getScannerName(): string;
}


export abstract class CliScannerStrategy implements ScannerStrategy {
    private isValidEnvironment?: boolean;

    public async validateEnvironment(): Promise<void> {
        if (this.isValidEnvironment) {
            return; // To help with performance, we do not need to validate again if we have already validated
        }
        if (!await SfCli.isSfCliInstalled()) {
            throw new Error(messages.error.sfMissing);
        }
        await this.validatePlugin();
        this.isValidEnvironment = true;
    }

    protected abstract validatePlugin(): Promise<void>;

    public abstract scan(filesToScan: string[]): Promise<Violation[]>;

    public abstract getScannerName(): string;
}
