import * as vscode from "vscode";
import cp from "node:child_process";
import {getErrorMessageWithStack, indent} from "./utils";
import {Logger} from "./logger";
import * as semver from "semver";

export type ExecOptions = {
    /**
     * Function that allows you to handle the identifier for the background process (pid)
     * @param pid process identifier
     */
    pidHandler?: (pid: number | undefined) => void

    /**
     * The log level at which we should log the command and its output.
     * If not supplied then vscode.LogLevel.Trace will be used.
     * If you wish to not log at all, then set the logLevel to equal vscode.LogLevel.Off.
     */
    logLevel?: vscode.LogLevel
}

export type CommandOutput = {
    /**
     * The captured standard output (stdout) while the command executed
     */
    stdout: string

    /**
     * The captured standard error (stderr) while the command executed
     */
    stderr: string

    /**
     * The exit code that the command returned
     */
    exitCode: number
}

export interface CliCommandExecutor {
    /**
     * Determine whether the Salesforce CLI is installed
     */
    isSfInstalled(): Promise<boolean>

    /**
     * Returns the installed version of the specified Salesforce CLI plugin or undefined if not installed
     * @param pluginName The name of the Salesforce CLI plugin
     */
    getSfCliPluginVersion(pluginName: string): Promise<semver.SemVer | undefined>

    /**
     * Execute a generic command and return a {@link CommandOutput}
     * If the command cannot be executed then instead of throwing an error, a {@link CommandOutput} is returned with exitCode 127.
     * @param command The command you wish to run
     * @param args A string array of input arguments for the command
     * @param options An optional {@link ExecOptions} instance
     */
    exec(command: string, args: string[], options?: ExecOptions): Promise<CommandOutput>
}

const IS_WINDOWS: boolean = process.platform.startsWith('win');

export class CliCommandExecutorImpl implements CliCommandExecutor {
    private readonly logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * Executes the cli command "sf --version" to determine whether the cli is installed or not
     */
    async isSfInstalled(): Promise<boolean> {
        const commandOutput: CommandOutput = await this.exec('sf', ['--version']);
        return commandOutput.exitCode === 0;
    }

    /**
     * Executes the cli command "sf plugins inspect <pluginName> --json" to determin the installed version of the
     * specified plugin or undefined if not installed
     */
    async getSfCliPluginVersion(pluginName: string): Promise<semver.SemVer | undefined> {
        const args: string[] = ['plugins', 'inspect', pluginName, '--json'];
        const commandOutput: CommandOutput = await this.exec('sf', args);
        if (commandOutput.exitCode === 0) {
            try {
                const pluginMetadata: {version: string}[] = JSON.parse(commandOutput.stdout) as {version: string}[];
                if (Array.isArray(pluginMetadata) && pluginMetadata.length === 1 && pluginMetadata[0].version) {
                    return new semver.SemVer(pluginMetadata[0].version);
                }
            } catch (err) { // Sanity check. Ideally this should never happen:
                throw new Error(`Error thrown when processing the output: sf ${args.join(' ')}\n\n` +
                    `==Error==\n${getErrorMessageWithStack(err)}\n\n==StdOut==\n${commandOutput.stdout}`);
            }
        }
        return undefined;
    }

    async exec(command: string, args: string[], options: ExecOptions = {}): Promise<CommandOutput> {
        return new Promise((resolve) => {
            const output: CommandOutput = {
                stdout: '',
                stderr: '',
                exitCode: 0
            };

            let childProcess: cp.ChildProcessWithoutNullStreams;
            try {
                childProcess = IS_WINDOWS ? cp.spawn(command, wrapArgsWithSpacesWithQuotes(args), {shell: true}) :
                    cp.spawn(command, args);
            } catch (err) {
                this.logger.logAtLevel(vscode.LogLevel.Error, `Failed to execute the following command:\n` +
                    indent(`${command} ${wrapArgsWithSpacesWithQuotes(args).join(' ')}`) + `\n\n` +
                    'Error Thrown:\n' + indent(getErrorMessageWithStack(err)));
                output.stderr = getErrorMessageWithStack(err);
                output.exitCode = 127;
                resolve(output);
            }

            if (options.pidHandler) {
                options.pidHandler(childProcess.pid);
            }
            const logLevel: vscode.LogLevel = options.logLevel === undefined ? vscode.LogLevel.Trace : options.logLevel;
            let combinedOut: string = '';

            this.logger.logAtLevel(logLevel, `Executing with background process (${childProcess.pid}):\n` +
                indent(`${command} ${wrapArgsWithSpacesWithQuotes(args).join(' ')}`));

            childProcess.stdout.on('data', data => {
                output.stdout += data;
                combinedOut += data;
            });
            childProcess.stderr.on('data', data => {
                output.stderr += data;
                combinedOut += data;
            });
            childProcess.on('error', (err: Error) => {
                const errMsg: string = getErrorMessageWithStack(err);
                output.exitCode = 127; // 127 signifies that the command could not be executed
                output.stderr += errMsg;
                combinedOut += errMsg;
                resolve(output);
                this.logger.logAtLevel(logLevel,
                    `Error from background process (${childProcess.pid}):\n${indent(combinedOut)}`);
            });
            childProcess.on('close', (exitCode: number) => {
                output.exitCode = exitCode;
                resolve(output);
                this.logger.logAtLevel(logLevel, `Finished background process (${childProcess.pid}):\n` +
                    indent(`ExitCode: ${output.exitCode}\nOutput:\n${indent(combinedOut)}`));
            });
        });
    }
}

function wrapArgsWithSpacesWithQuotes(args: string[]): string[] {
    return args.map(arg => arg.includes(' ') ? `"${arg}"` : arg);
}
