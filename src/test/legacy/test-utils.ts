import {Logger} from "../../lib/logger";

export class SpyLogger implements Logger {
	logCallHistory: {msg: string}[] = [];
	log(msg: string): void {
		this.logCallHistory.push({msg});
	}

	warnCallHistory: {msg: string}[] = [];
	warn(msg: string): void {
		this.warnCallHistory.push({msg});
	}

	errorCallHistory: {msg: string}[] = [];
	error(msg: string): void {
		this.errorCallHistory.push({msg});
	}

	debugCallHistory: {msg: string}[] = [];
	debug(msg: string): void {
		this.debugCallHistory.push({msg});
	}

	traceCallHistory: {msg: string}[] = [];
	trace(msg: string): void {
		this.traceCallHistory.push({msg});
	}
}
