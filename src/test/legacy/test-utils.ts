import {Logger} from "../../lib/logger";
import {TelemetryService} from "../../lib/external-services/telemetry-service";
import {Properties} from "@salesforce/vscode-service-provider";
import {DiagnosticManager, CodeAnalyzerDiagnostic} from "../../lib/diagnostics";
import * as vscode from "vscode";

export class SpyLogger implements Logger {
    logAtLevelCallHistory: {logLevel: vscode.LogLevel, msg: string}[] = [];

    logAtLevel(logLevel: vscode.LogLevel, msg: string): void {
        this.logAtLevelCallHistory.push({logLevel, msg});
    }

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


type TelemetryExceptionData = {
    name: string;
    message: string;
    data?: Record<string, string>;
};

export class StubTelemetryService implements TelemetryService {

    private exceptionCalls: TelemetryExceptionData[] = [];

    public sendExtensionActivationEvent(_hrStart: number): void {
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
    addDiagnostics(_diags: CodeAnalyzerDiagnostic[]): void {
        // NO-OP
    }

    clearAllDiagnostics(): void {
        // NO-OP
    }

    clearDiagnostic(_diag: CodeAnalyzerDiagnostic): void {
        // NO-OP
    }

    clearDiagnosticsInRange(_uri: vscode.Uri, _range: vscode.Range): void {
        // NO-OP
    }

    clearDiagnosticsForFiles(_uris: vscode.Uri[]): void {
        // NO-OP
    }

    handleTextDocumentChangeEvent(_event: vscode.TextDocumentChangeEvent): void {
        // NO-OP
    }

    dispose(): void {
        // NO-OP
    }
}
