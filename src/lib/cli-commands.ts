import cp from "node:child_process";
import {getErrorMessageWithStack} from "./utils";

export type CommandOutput = {
    stdout: string
    stderr: string
    exitCode: number
}

export interface CliCommandExecutor {
    /**
     * Execute a generic command and return a {@link CommandOutput}
     * If the command cannot be executed then instead of throwing an error, a {@link CommandOutput} is returned with exitCode 127.
     * @param command The command you wish to run
     * @param args A string array of input arguments for the command
     * @param pidHandler A function that can handle the PID associated with the execution
     */
    exec(command: string, args: string[], pidHandler?: (pid: number | undefined) => void): Promise<CommandOutput>
}

export class CliCommandExecutorImpl implements CliCommandExecutor {
    async exec(command: string, args: string[], pidHandler?: (pid: number | undefined) => void): Promise<CommandOutput> {
        return new Promise((resolve) => {
            const childProcess: cp.ChildProcessWithoutNullStreams  = cp.spawn(command, args, {
                shell: process.platform.startsWith('win'), // Use shell on Windows machines
            });

            if (pidHandler) {
                pidHandler(childProcess.pid);
            }

            const output: CommandOutput = {
                stdout: '',
                stderr: '',
                exitCode: 0
            };
            childProcess.stdout.on('data', data => {
                output.stdout += data;
            });
            childProcess.stderr.on('data', data => {
                output.stderr += data;
            });
            childProcess.on('error', (err: Error) => {
                output.exitCode = 127; // 127 signifies that the command could not be executed
                output.stderr += getErrorMessageWithStack(err);
                resolve(output);
            });
            childProcess.on('close', (exitCode: number) => {
                output.exitCode = exitCode;
                resolve(output);
            });
        });
    }
}
