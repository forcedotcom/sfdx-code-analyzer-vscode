import {Violation} from '../diagnostics';
import {Workspace} from "../workspace";

export interface CliScannerStrategy {
    scan(workspace: Workspace): Promise<Violation[]>;

    getScannerName(): Promise<string>;

    getRuleDescriptionFor(engineName: string, ruleName: string): Promise<string>;
}
