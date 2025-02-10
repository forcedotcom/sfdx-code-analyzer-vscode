import { DiagnosticConvertible } from "./diagnostics";

export type ProgressNotification = {
	message?: string;
	increment?: number;
};

export interface Display {
	displayProgress(notification: ProgressNotification): void;

	displayResults(allTargets: string[], results: DiagnosticConvertible[]): Promise<void>;
}

export class UxDisplay implements Display {
	private readonly displayable: Displayable;

	public constructor(displayable: Displayable) {
		this.displayable = displayable;
	}

	public displayProgress(notification: ProgressNotification): void {
		this.displayable.progress(notification);
	}

	public async displayResults(allTargets: string[], results: DiagnosticConvertible[]): Promise<void> {
		await this.displayable.results(allTargets, results);
	}
}

export interface Displayable {
	progress(notification: ProgressNotification): void;

	results(allTargets: string[], results: DiagnosticConvertible[]): Promise<void>;
}


