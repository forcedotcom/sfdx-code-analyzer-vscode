import {Violation} from '../diagnostics';

export interface CliScannerStrategy {
    scan(filesToScan: string[]): Promise<Violation[]>;

    getScannerName(): Promise<string>;

    getRuleDescriptionFor(engineName: string, ruleName: string): Promise<string>;
}
