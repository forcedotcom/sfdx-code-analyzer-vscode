import * as vscode from "vscode";

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
