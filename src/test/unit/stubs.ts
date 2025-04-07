import {TelemetryService} from "../../lib/external-services/telemetry-service";
import {Logger} from "../../lib/logger";
import {LLMService, LLMServiceProvider} from "../../lib/external-services/llm-service";
import {ScannerStrategy} from "../../lib/scanner-strategies/scanner-strategy";
import {CodeAnalyzerDiagnostic, Violation} from "../../lib/diagnostics";
import {Display, ProgressEvent} from "../../lib/display";
import {UnifiedDiffService} from "../../lib/unified-diff-service";
import {TextDocument} from "vscode";
import {FixSuggester, FixSuggestion} from "../../lib/fix-suggestion";


export class SpyTelemetryService implements TelemetryService {
    sendExtensionActivationEventCallHistory: { hrStart: [number, number] }[] = [];

    sendExtensionActivationEvent(hrStart: [number, number]): void {
        this.sendExtensionActivationEventCallHistory.push({hrStart});
    }

    sendCommandEventCallHistory: { commandName: string, properties: Record<string, string> }[] = [];

    sendCommandEvent(commandName: string, properties: Record<string, string>): void {
        this.sendCommandEventCallHistory.push({commandName, properties});
    }

    sendExceptionCallHistory: { name: string, errorMessage: string, properties?: Record<string, string> }[] = [];

    sendException(name: string, errorMessage: string, properties?: Record<string, string>): void {
        this.sendExceptionCallHistory.push({name, errorMessage, properties});
    }
}

export class SpyLogger implements Logger {
    logCallHistory: { msg: string }[] = [];

    log(msg: string): void {
        this.logCallHistory.push({msg});
    }

    warnCallHistory: { msg: string }[] = [];

    warn(msg: string): void {
        this.warnCallHistory.push({msg});
    }

    errorCallHistory: { msg: string }[] = [];

    error(msg: string): void {
        this.errorCallHistory.push({msg});
    }

    debugCallHistory: { msg: string }[] = [];

    debug(msg: string): void {
        this.debugCallHistory.push({msg});
    }

    traceCallHistory: { msg: string }[] = [];

    trace(msg: string): void {
        this.traceCallHistory.push({msg});
    }
}

export class SpyDisplay implements Display {
    displayProgressCallHistory: { progressEvent: ProgressEvent }[] = [];

    displayProgress(progressEvent: ProgressEvent): void {
        this.displayProgressCallHistory.push({progressEvent});
    }

    displayInfoCallHistory: { msg: string }[] = [];

    displayInfo(msg: string): void {
        this.displayInfoCallHistory.push({msg});
    }

    displayWarningCallHistory: { msg: string }[] = [];

    displayWarning(msg: string): void {
        this.displayWarningCallHistory.push({msg});
    }

    displayErrorCallHistory: { msg: string }[] = [];

    displayError(msg: string): void {
        this.displayErrorCallHistory.push({msg});
    }
}

export class SpyLLMService implements LLMService {
    callLLMReturnValue: string = 'dummyReturnValue';
    callLLMCallHistory: { prompt: string, guidedJsonSchema?: string }[] = []

    callLLM(prompt: string, guidedJsonSchema?: string): Promise<string> {
        this.callLLMCallHistory.push({prompt, guidedJsonSchema});
        return Promise.resolve(this.callLLMReturnValue);
    }
}

export class ThrowingLLMService implements LLMService {
    callLLM(_prompt: string, _guidedJsonSchema?: string): Promise<string> {
        throw new Error("Error from callLLM");
    }
}

export class StubLLMServiceProvider implements LLMServiceProvider {
    private readonly llmService: LLMService;

    constructor(llmService: LLMService) {
        this.llmService = llmService;
    }

    isLLMServiceAvailableReturnValue: boolean = true;

    isLLMServiceAvailable(): Promise<boolean> {
        return Promise.resolve(this.isLLMServiceAvailableReturnValue);
    }

    getLLMService(): Promise<LLMService> {
        return Promise.resolve(this.llmService);
    }
}

export class ThrowingLLMServiceProvider implements LLMServiceProvider {
    getLLMService(): Promise<LLMService> {
        throw new Error("Error from getLLMService");
    }

    isLLMServiceAvailable(): Promise<boolean> {
        throw new Error("Error from isLLMServiceAvailable");
    }

}

export class StubScannerStrategy implements ScannerStrategy {
    validateEnvironment(): Promise<void> {
        return Promise.resolve(); // No-op
    }

    scanReturnValue: Violation[] = [];

    scan(_filesToScan: string[]): Promise<Violation[]> {
        return Promise.resolve(this.scanReturnValue);
    }

    getScannerNameReturnValue: string = 'dummyScannerName';

    getScannerName(): string {
        return this.getScannerNameReturnValue;
    }
}

export class SpyUnifiedDiffService implements UnifiedDiffService {
    register(): void {
        // no-op
    }

    dispose() {
        // no op
    }

    hasDiffReturnValue: boolean = false;
    hasDiffCallHistory: { document: TextDocument }[] = [];
    hasDiff(document: TextDocument): boolean {
        this.hasDiffCallHistory.push({document});
        return this.hasDiffReturnValue;
    }

    showDiffCallHistory: {
        document: TextDocument,
        newCode: string,
        acceptCallback: () => Promise<void>,
        rejectCallback: () => Promise<void>
    }[] = [];
    showDiff(document: TextDocument, newCode: string, acceptCallback: () => Promise<void>, rejectCallback: () => Promise<void>): Promise<void> {
        this.showDiffCallHistory.push({document, newCode, acceptCallback, rejectCallback});
        return Promise.resolve();
    }

    clearDiffCallHistory: {document: TextDocument}[] = [];
    clearDiff(document: TextDocument): Promise<void> {
        this.clearDiffCallHistory.push({document});
        return Promise.resolve();
    }
}

export class ThrowingUnifiedDiffService implements UnifiedDiffService {
    register(): void {
        // no-op
    }

    dispose() {
        // no-op
    }

    hasDiff(_document: TextDocument): boolean {
        return false;
    }

    showDiff(_document: TextDocument, _newCode: string, _acceptCallback: () => Promise<void>, _rejectCallback: () => Promise<void>): Promise<void> {
        throw new Error('Error thrown from: showDiff');
    }

    clearDiff(_document: TextDocument): Promise<void> {
        // no-op
        return Promise.resolve();
    }
}


export class SpyFixSuggester implements FixSuggester {
    suggestFixReturnValue: FixSuggestion | null = null;
    suggestFixCallHistory: {document: TextDocument, diagnostic: CodeAnalyzerDiagnostic}[] = [];
    suggestFix(document: TextDocument, diagnostic: CodeAnalyzerDiagnostic): Promise<FixSuggestion | null> {
        this.suggestFixCallHistory.push({document, diagnostic});
        return Promise.resolve(this.suggestFixReturnValue);
    }
}

export class ThrowingFixSuggester implements FixSuggester {
    suggestFix(_document: TextDocument, _diagnostic: CodeAnalyzerDiagnostic): Promise<FixSuggestion | null> {
        throw new Error('Error thrown from: suggestFix');
    }
}
