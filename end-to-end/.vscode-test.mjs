import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineConfig } from '@vscode/test-cli';

const extensionsDir = path.resolve(import.meta.dirname, '.vscode-test', 'extensions');
fs.mkdirSync(extensionsDir, { recursive: true });

export default defineConfig({
    /**
     * A file or list of files in which to find tests. Non-absolute paths will
     * be treated as glob expressions relative to the location of
     * the `.vscode-test.js` file.
     */
    files: 'out/**/*.test.js',

    /**
     * Defines extension directories to load during tests. Defaults to the directory
     * of the `.vscode-test.js` file. Must include a `package.json` Extension Manifest.
     */
    extensionDevelopmentPath: path.resolve(import.meta.dirname, '..'),

    /**
     * Path to a folder or workspace file that should be opened.
     */
    workspaceFolder: path.resolve(import.meta.dirname, 'sampleWorkspace'),

    /**
     * A list of vscode extensions to install prior to running the tests.
     * Can be specified as 'owner.extension', 'owner.extension@2.3.15',
     * 'owner.extension@prerelease', or the path to a vsix file (/path/to/extension.vsix)
     */
    installExtensions: ['salesforce.salesforcedx-vscode-core'],
    
    /**
     * A list of launch arguments passed to VS Code executable, in addition to `--extensionDevelopmentPath`
     * and `--extensionTestsPath` which are provided by `extensionDevelopmentPath` and `extensionTestsPath`
     * options.
     *
     * If the first argument is a path to a file/folder/workspace, the launched VS Code instance
     * will open it.
     *
     * See `code --help` for possible arguments.
     */
    launchArgs: [
        `--extensions-dir=${extensionsDir}`
    ]
});