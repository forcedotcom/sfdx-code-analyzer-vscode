import * as vscode from 'vscode';
import {ProgressOptions} from "vscode";

export type ProgressEvent = {
    message?: string;
    increment?: number;
};

export interface ProgressReporter {
    reportProgress(progressEvent: ProgressEvent): void;
}

export type TaskWithProgress = (progressReporter: ProgressReporter) => Promise<void>;

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
        const promiseLike: PromiseLike<void> = vscode.window.withProgress(progressOptions, (progressFcn: vscode.Progress<ProgressEvent>): Promise<void> => {
            const progressReporter: ProgressReporter = new ProgressReporterImpl(progressFcn);
            return task(progressReporter);
        });
        return Promise.resolve(promiseLike);
    }
}
