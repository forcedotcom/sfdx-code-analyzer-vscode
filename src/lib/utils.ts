import {randomUUID} from "node:crypto";

export interface UUIDGenerator {
    generateUUID(): string
}

export class RandomUUIDGenerator implements UUIDGenerator {
    generateUUID(): string {
        return randomUUID();
    }
}
