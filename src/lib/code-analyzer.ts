import {Violation} from "./diagnostics";
import {CliScannerV4Strategy} from "./scanner-strategies/v4-scanner";
import {CliScannerV5Strategy} from "./scanner-strategies/v5-scanner";
import {SettingsManager} from "./settings";
import {Display} from "./display";

export interface CodeAnalyzer {
    validateEnvironment(): Promise<void>;

    scan(filesToScan: string[]): Promise<Violation[]>;

    getScannerName(): string;

    getRuleDescriptionFor(engineName: string, ruleName: string): Promise<string>;
}

export class CodeAnalyzerImpl implements CodeAnalyzer {
    private readonly settingsManager: SettingsManager;
    private readonly display: Display;

    private codeAnalyzerV4?: CliScannerV4Strategy;
    private codeAnalyzerV5?: CliScannerV5Strategy;

    constructor(settingsManager: SettingsManager, display: Display) {
        this.settingsManager = settingsManager;
        this.display = display;
    }

    private getDelegate(): CodeAnalyzer {
        return this.settingsManager.getCodeAnalyzerUseV4Deprecated() ? this.getCodeAnalyzerV4() : this.getCodeAnalyzerV5();
    }

    private getCodeAnalyzerV4(): CodeAnalyzer {
        if (!this.codeAnalyzerV4) {
            this.codeAnalyzerV4 = new CliScannerV4Strategy(this.settingsManager);
        }
        return this.codeAnalyzerV4;
    }

    private getCodeAnalyzerV5(): CodeAnalyzer {
        if (!this.codeAnalyzerV5) {
            this.codeAnalyzerV5 = new CliScannerV5Strategy(this.settingsManager, this.display);
        }
        return this.codeAnalyzerV5;
    }

    validateEnvironment(): Promise<void> {
        return this.getDelegate().validateEnvironment();
    }

    scan(filesToScan: string[]): Promise<Violation[]> {
        return this.getDelegate().scan(filesToScan);
    }

    getScannerName(): string {
        return this.getDelegate().getScannerName();
    }

    getRuleDescriptionFor(engineName: string, ruleName: string): Promise<string> {
        return this.getDelegate().getRuleDescriptionFor(engineName, ruleName);
    }
}
