import {TelemetryService} from "../../lib/external-services/telemetry-service";
import {UnifiedDiffTool} from "../../lib/unified-diff/unified-diff-tool";
import {Logger} from "../../lib/logger";
import {LLMService, LLMServiceProvider} from "../../lib/external-services/llm-service";
import {ScannerStrategy} from "../../lib/scanner-strategies/scanner-strategy";
import {Violation} from "../../lib/diagnostics";
import {Display, ProgressEvent} from "../../lib/display";


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
    displayProgressCallHistory: {progressEvent: ProgressEvent}[] = [];
    displayProgress(progressEvent: ProgressEvent): void {
        this.displayProgressCallHistory.push({progressEvent});
    }

    displayInfoCallHistory: {msg: string}[] = [];
    displayInfo(msg: string): void {
        this.displayInfoCallHistory.push({msg});
    }

    displayWarningCallHistory: {msg: string}[] = [];
    displayWarning(msg: string): void {
        this.displayWarningCallHistory.push({msg});
    }

    displayErrorCallHistory: {msg: string}[] = [];
    displayError(msg: string): void {
        this.displayErrorCallHistory.push({msg});
    }
}

export class SpyUnifiedDiffTool implements UnifiedDiffTool<object> {
    createDiffCallHistory: { code: string, file?: string }[] = [];

    createDiff(code: string, file?: string): Promise<void> {
        this.createDiffCallHistory.push({code, file});
        return Promise.resolve();
    }

    acceptDiffHunkReturnValue: number = 9;
    acceptDiffHunkCallHistory: { diffHunk: object }[] = [];

    acceptDiffHunk(diffHunk: object): Promise<number> {
        this.acceptDiffHunkCallHistory.push({diffHunk});
        return Promise.resolve(this.acceptDiffHunkReturnValue);
    }

    rejectDiffHunkCallHistory: { diffHunk: object }[] = [];

    rejectDiffHunk(diffHunk: object): Promise<void> {
        this.rejectDiffHunkCallHistory.push({diffHunk});
        return Promise.resolve();
    }

    acceptAllReturnValue: number = 16;
    acceptAllCallCount: number = 0;

    acceptAll(): Promise<number> {
        this.acceptAllCallCount++;
        return Promise.resolve(this.acceptAllReturnValue);
    }

    rejectAllCallCount: number = 0;

    rejectAll(): Promise<void> {
        this.rejectAllCallCount++;
        return Promise.resolve();
    }
}

export class ThrowingUnifiedDiffTool implements UnifiedDiffTool<object> {
    createDiff(_code: string, _file?: string): Promise<void> {
        throw new Error("Error from createDiff");
    }

    acceptDiffHunk(_diffHunk: object): Promise<number> {
        throw new Error("Error from acceptDiffHunk");
    }

    rejectDiffHunk(_diffHunk: object): Promise<void> {
        throw new Error("Error from rejectDiffHunk");
    }

    acceptAll(): Promise<number> {
        throw new Error("Error from acceptAll");
    }

    rejectAll(): Promise<void> {
        throw new Error("Error from rejectAll");
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
