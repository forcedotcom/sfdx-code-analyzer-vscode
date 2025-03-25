import {randomUUID} from "node:crypto";

export interface UUIDGenerator {
    generateUUID(): string
}

export class RandomUUIDGenerator implements UUIDGenerator {
    generateUUID(): string {
        return randomUUID();
    }
}

export function getErrorMessage(error: unknown): string {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return error instanceof Error ? error.message : /* istanbul ignore next */ String(error);
}

export function getErrorMessageWithStack(error: unknown): string {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return error instanceof Error ? error.stack : /* istanbul ignore next */ String(error);
}
