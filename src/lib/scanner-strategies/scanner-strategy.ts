import {Violation} from '../diagnostics';
import {SfCli} from '../sf-cli';
import {messages} from '../messages';
import {CodeAnalyzer} from "../code-analyzer";


// TODO: Eventually (probably once we remove v4 officially) then we can rename and move the strategy classes to be
// directly inside of code-analyzer.ts

export abstract class CliScannerStrategy implements CodeAnalyzer {
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

    public abstract getRuleDescriptionFor(engineName: string, ruleName: string): Promise<string>;
}
