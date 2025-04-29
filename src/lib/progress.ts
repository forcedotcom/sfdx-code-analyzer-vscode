import * as vscode from 'vscode';
import {ProgressOptions} from "vscode";

export type ProgressEvent = {
    message?: string;
    increment?: number;
};

export interface ProgressReporter {
    reportProgress(progressEvent: ProgressEvent): void;
}

// Note that VS Code uses Thenables (which are just PromiseLike objects) which are basically Promises without catch
// statements... so any task provided must not throw an exception and must resolve in order for the task progress
// window to close.
export type TaskWithProgress = (progressReporter: ProgressReporter) => PromiseLike<void>;

export interface TaskWithProgressRunner {
    runTask(task: TaskWithProgress): Promise<void>;
}

export class ProgressReporterImpl implements ProgressReporter {
    private readonly progressFcn: vscode.Progress<ProgressEvent>;

    constructor(progressFcn: vscode.Progress<ProgressEvent>) {
        this.progressFcn = progressFcn;
    }

    reportProgress(progressEvent: ProgressEvent): void {
        this.progressFcn.report(progressEvent);
    }
}

export class TaskWithProgressRunnerImpl {
    async runTask(task: TaskWithProgress): Promise<void> {
        const progressOptions: ProgressOptions = {
            location: vscode.ProgressLocation.Notification
        }
        const promiseLike: PromiseLike<void> = vscode.window.withProgress(progressOptions, (progressFcn: vscode.Progress<ProgressEvent>): PromiseLike<void> => {
            const progressReporter: ProgressReporter = new ProgressReporterImpl(progressFcn);
            return task(progressReporter);
        });
        return Promise.resolve(promiseLike);
    }
}
