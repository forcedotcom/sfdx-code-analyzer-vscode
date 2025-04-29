/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as fs from 'fs';
import * as tmp from 'tmp';
import {promisify} from "node:util";

tmp.setGracefulCleanup();
const tmpFileAsync = promisify((options: tmp.FileOptions, cb: tmp.FileCallback) => tmp.file(options, cb));

export interface FileHandler {
    /**
     * Checks to see if the provided file or folder exists
     * @param path - file or folder path
     */
    exists(path: string): Promise<boolean>

    /**
     * Assuming the file or folder path exists, checks if the path is a folder
     * @param path - file or folder path
     */
    isDir(path: string): Promise<boolean>

    /**
     * Creates a temporary file
     * @param ext - optional extension to apply to the file
     */
    createTempFile(ext?: string): Promise<string>
}

export class FileHandlerImpl implements FileHandler {
    async exists(path: string): Promise<boolean> {
        try {
            await fs.promises.access(path, fs.constants.F_OK);
            return true;
        } catch (_e) {
            return false;
        }
    }

    async isDir(path: string): Promise<boolean> {
        return (await fs.promises.stat(path)).isDirectory();
    }

    async createTempFile(ext?: string): Promise<string> {
        return await tmpFileAsync(ext ? {postfix: ext}: {});
    }
}
