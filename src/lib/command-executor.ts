import cp from "node:child_process";
import * as cspawn from 'cross-spawn';


export type CommandOutput = {
    stdout: string
    stderr: string
    exitCode: number
}

export async function execCommand(command: string, args: string[]): Promise<CommandOutput> {
    return new Promise((resolve, reject) => {
        const output: CommandOutput = {
            stdout: '',
            stderr: '',
            exitCode: 0
        };

        // TODO: see why we can't just use cp.swap instead of cross-spawn
        const childProcess: cp.ChildProcessWithoutNullStreams  = cspawn.spawn(command, args);
        
        childProcess.stdout.on('data', data => {
            output.stdout += data;
        });
        childProcess.stderr.on('data', data => {
            output.stderr += data;
        });
        childProcess.on('error', (err: Error) => {
            reject(new Error(`Error thrown when attempting to execute the following command: ${command} ${args.join(' ')}\n` +
                   err.message));
        });
        childProcess.on('close', (exitCode: number) => {
            output.exitCode = exitCode;
            resolve(output);
        });
    });
}
