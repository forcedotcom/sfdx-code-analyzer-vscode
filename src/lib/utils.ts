import * as path from 'path';
import * as vscode from 'vscode';
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

export function indent(value: string, indentation = '    '): string {
    return indentation + value.replaceAll('\n', `\n${indentation}`);
}

/**
 * Checks if a file is valid for analysis based on allowed file extensions.
 * @param documentUri - The URI of the document to check
 * @param allowedFileTypes - Set of allowed file extensions (e.g., ['.cls', '.js', '.apex'])
 * @returns true if the file extension is in the allowed set, false otherwise
 */
export function isValidFileForAnalysis(documentUri: vscode.Uri, allowedFileTypes: Set<string>): boolean {
    // Convert file extension to lowercase for case-insensitive matching
    const fileExtension = path.extname(documentUri.fsPath).toLowerCase();
    return allowedFileTypes.has(fileExtension);
}
