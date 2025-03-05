import vscode, {LogLevel} from "vscode";

export interface Logger {
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

    // Displays error message when log level is set to Error, Warning, Info, Debug, or Trace
    error(msg: string): void {
        this.outputChannel.error(msg);
        this.outputChannel.show();
    }

    // Displays warn message when log level is set to Warning, Info, Debug, or Trace
    warn(msg: string): void {
        this.outputChannel.warn(msg);
        this.outputChannel.show();
    }

    // Displays log message when log level is set to Info, Debug, or Trace
    log(msg: string): void {
        this.outputChannel.appendLine(msg);
        this.outputChannel.show();
    }

    // Displays debug message when log level is set to Debug or Trace
    debug(msg: string): void {
        this.outputChannel.debug(msg);
        this.outputChannel.show();

        // Additionally display debug log messages to the console.log as well
        if ([LogLevel.Debug, LogLevel.Trace].includes(this.outputChannel.logLevel)) {
            console.log(`[${this.outputChannel.name}] ${msg}`);
        }
    }

    // Displays trace message when log level is set to Trace
    trace(msg: string): void {
        this.outputChannel.trace(msg);
        this.outputChannel.show();

        // Additionally display trace log messages to the console.log as well
        if (this.outputChannel.logLevel === LogLevel.Trace) {
            console.log(`[${this.outputChannel.name}] ${msg}`);
        }
    }
}
