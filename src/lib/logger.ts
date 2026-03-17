import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

export const E2E_LOG_FILENAME = ".sfca-e2e.log";

export interface Logger {
    logAtLevel(logLevel: vscode.LogLevel, msg: string): void;
    log(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
    debug(msg: string): void;
    trace(msg: string): void;
}

/**
 * Logger within VS Code's output channel framework which reacts to the log level set by the user via the command:
 * > Developer: Set Log Level... (Trace, Debug, Info, Warning, Error, Off)
 */
export class LoggerImpl implements Logger {
    private readonly outputChannel: vscode.LogOutputChannel;

    constructor(outputChannel: vscode.LogOutputChannel) {
        this.outputChannel = outputChannel;
    }

    logAtLevel(logLevel: vscode.LogLevel, msg: string): void {
        if (logLevel === vscode.LogLevel.Error) {
            this.error(msg);
        } else if (logLevel === vscode.LogLevel.Warning) {
            this.warn(msg);
        } else if (logLevel === vscode.LogLevel.Info) {
            this.log(msg);
        } else if (logLevel === vscode.LogLevel.Debug) {
            this.debug(msg);
        } else if (logLevel === vscode.LogLevel.Trace) {
            this.trace(msg);
        }
    }

    // Displays error message when log level is set to Error, Warning, Info, Debug, or Trace
    error(msg: string): void {
        this.outputChannel.error(msg);
    }

    // Displays warn message when log level is set to Warning, Info, Debug, or Trace
    warn(msg: string): void {
        this.outputChannel.warn(msg);
    }

    // Displays log message when log level is set to Info, Debug, or Trace
    log(msg: string): void {
        this.outputChannel.appendLine(msg);
    }

    // Displays debug message when log level is set to Debug or Trace
    debug(msg: string): void {
        this.outputChannel.debug(msg);

        // Additionally display debug log messages to the console.log as well as making the output channel visible
        if ([vscode.LogLevel.Debug, vscode.LogLevel.Trace].includes(this.outputChannel.logLevel)) {
            this.outputChannel.show(true); // preserveFocus should be true so that we don't make the output window the active TextEditor
            console.log(`[${this.outputChannel.name}] ${msg}`);
        }
    }

    // Displays trace message when log level is set to Trace
    trace(msg: string): void {
        this.outputChannel.trace(msg);

        // Additionally display trace log messages to the console.log as well
        if (this.outputChannel.logLevel === vscode.LogLevel.Trace) {
            this.outputChannel.show(true); // preserveFocus should be true so that we don't make the output window the active TextEditor
            console.log(`[${this.outputChannel.name}] ${msg}`);
        }
    }
}

/**
 * Wraps a Logger and appends every message to a workspace file so E2E tests (running in the
 * test runner process) can read and console.log it, making extension logs visible in GHA CI
 * where extension host stdout is not captured.
 */
export class E2ELogTee implements Logger {
    private readonly inner: Logger;
    private readonly logFilePath: string;

    constructor(inner: Logger, workspaceFolderPath: string) {
        this.inner = inner;
        this.logFilePath = path.join(workspaceFolderPath, E2E_LOG_FILENAME);
    }

    private append(level: string, msg: string): void {
        try {
            const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
            fs.appendFileSync(this.logFilePath, line);
        } catch {
            // ignore write errors (e.g. read-only workspace)
        }
    }

    logAtLevel(logLevel: vscode.LogLevel, msg: string): void {
        this.append("logAtLevel", msg);
        this.inner.logAtLevel(logLevel, msg);
    }

    error(msg: string): void {
        this.append("error", msg);
        this.inner.error(msg);
    }

    warn(msg: string): void {
        this.append("warn", msg);
        this.inner.warn(msg);
    }

    log(msg: string): void {
        this.append("log", msg);
        this.inner.log(msg);
    }

    debug(msg: string): void {
        this.append("debug", msg);
        this.inner.debug(msg);
    }

    trace(msg: string): void {
        this.append("trace", msg);
        this.inner.trace(msg);
    }
}
