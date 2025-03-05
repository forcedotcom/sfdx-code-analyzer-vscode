import {randomUUID} from "node:crypto";

export abstract class Clock {
	abstract now(): Date;

	public getCurrentTimeText(): string {
		const t: Date = this.now();
		const hours: string = String(t.getHours()).padStart(2, '0');
		const minutes: string = String(t.getMinutes()).padStart(2, '0');
		const seconds: string = String(t.getSeconds()).padStart(2, '0');
		const milliseconds: number = t.getMilliseconds();
		return `${hours}:${minutes}:${seconds}.${milliseconds}`;
	}
}

export class RealClock extends Clock {
	now(): Date {
		return new Date();
	}
}

export interface UUIDGenerator {
	generateUUID(): string
}

export class RandomUUIDGenerator implements UUIDGenerator {
    generateUUID(): string {
        return randomUUID();
    }
}
