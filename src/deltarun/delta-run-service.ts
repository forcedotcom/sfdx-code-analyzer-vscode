/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as fs from 'fs';

export function getDeltaRunTarget(sfgecachepath:string, savedFilesCache:Set<string>): string[] {
        // Read and parse the JSON file at sfgecachepath
        const fileContent = fs.readFileSync(sfgecachepath, 'utf-8');
        const parsedData = JSON.parse(fileContent) as CacheData;
    
        const matchingEntries: string[] = [];
    
        // Iterate over each file entry in the data
        parsedData.data.forEach((entry: { filename: string, entries: string[] }) => {
            // Check if the filename is in the savedFilesCache
            if (savedFilesCache.has(entry.filename)) {
                // If it matches, add the individual entries to the result array
                matchingEntries.push(...entry.entries);
            }
        });
    
        return matchingEntries;
}

interface CacheEntry {
    filename: string;
    entries: string[];
}

interface CacheData {
    data: CacheEntry[];
}