import {Logger} from "../../lib/logger";
import {TelemetryService} from "../../lib/external-services/telemetry-service";
import {Properties} from "@salesforce/vscode-service-provider";
import {DiagnosticConvertible, DiagnosticManager} from "../../lib/diagnostics";
import vscode from "vscode";
import {LLMService, LLMServiceProvider} from "../../lib/external-services/llm-service";

export class SpyLogger implements Logger {
    logCallHistory: {msg: string}[] = [];
    log(msg: string): void {
        this.logCallHistory.push({msg});
    }

    warnCallHistory: {msg: string}[] = [];
    warn(msg: string): void {
        this.warnCallHistory.push({msg});
    }

    errorCallHistory: {msg: string}[] = [];
    error(msg: string): void {
        this.errorCallHistory.push({msg});
    }

    debugCallHistory: {msg: string}[] = [];
    debug(msg: string): void {
        this.debugCallHistory.push({msg});
    }

    traceCallHistory: {msg: string}[] = [];
    trace(msg: string): void {
        this.traceCallHistory.push({msg});
    }
}


type TelemetryExceptionData = {
    name: string;
    message: string;
    data?: Record<string, string>;
};

export class StubTelemetryService implements TelemetryService {

    private exceptionCalls: TelemetryExceptionData[] = [];

    public sendExtensionActivationEvent(_hrStart: [number, number]): void {
        // NO-OP
    }

    public sendCommandEvent(_key: string, _data: Properties): void {
        // NO-OP
    }

    public sendException(name: string, message: string, data?: Record<string, string>): void {
        this.exceptionCalls.push({
            name,
            message,
            data
        });
    }

    public getSentExceptions(): TelemetryExceptionData[] {
        return this.exceptionCalls;
    }

    public dispose(): void {
        // NO-OP
    }
}

export class StubDiagnosticManager implements DiagnosticManager {
    clearDiagnostics(): void {
        // NO-OP
    }

    clearDiagnosticsInRange(_uri: vscode.Uri, _range: vscode.Range): void {
        // NO-OP
    }

    async clearDiagnosticsForSelectedFiles(_selections: vscode.Uri[], _commandName: string): Promise<void> {
        // NO-OP
    }

    public displayAsDiagnostics(_allTargets: string[], _convertibles: DiagnosticConvertible[]): void {
        // NO-OP
    }
    dispose() {
        // NO-OP
    }
}


export class StubLLMServiceProvider implements LLMServiceProvider {
    private readonly llmService?: LLMService;

    constructor(llmService?: LLMService) {
        this.llmService = llmService;
    }

    isLLMServiceAvailable(): Promise<boolean> {
        return Promise.resolve(!!this.llmService);
    }
    getLLMService(): Promise<LLMService> {
        return Promise.resolve(this.llmService);
    }
}

export class SpyLLMService implements LLMService {
    callLLMResponse: string = 'DummyResponse'
    callLLMCallHistory: {prompt: string, guidedJsonSchema?: string}[] = []
    callLLM(prompt: string, guidedJsonSchema?: string): Promise<string> {
        this.callLLMCallHistory.push({prompt, guidedJsonSchema});
        return Promise.resolve(this.callLLMResponse)
    }
}
