/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {promises as fs, constants as fsConstants} from 'fs';

/**
 * 
 * @param fileName The name of a file that may or may not exist.
 * @returns A Promise that resolves to {@code true} if the file exists, else {@code false}.
 */
export async function exists(fileName: string): Promise<boolean> {
    try {
        await fs.access(fileName, fsConstants.F_OK);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * 
 * @param {string} fileName A path that may or may not be an existing directory.
 * @returns A Promise that resolves to {@code true} if the path exists and is a directory, else {@code false}.
 */
export async function isDir(fileName: string): Promise<boolean> {
    try {
        await fs.access(fileName, fsConstants.F_OK);
        return (await fs.stat(fileName)).isDirectory();
    } catch (e) {
        return false;
    }
}