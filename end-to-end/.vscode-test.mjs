import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { defineConfig } from '@vscode/test-cli';

// So the extension can write E2E logs to a path the workflow can cat (extension host inherits env).
process.env.SFCA_E2E_LOG_DIR = path.resolve(import.meta.dirname, 'sampleWorkspace');

const extensionsDir = path.resolve(import.meta.dirname, '.vscode-test', 'extensions');
fs.mkdirSync(extensionsDir, { recursive: true });

// Use a path under the repo so GHA can cat VS Code extension-host logs when the Core dependency fails to activate.
const userDataDir = path.join(import.meta.dirname, 'sampleWorkspace', '.vscode-test-user-data');
fs.mkdirSync(userDataDir, { recursive: true });

// Optional: use unpublished VSIXs from workflow (e.g. download-artifact to end-to-end/.vsix/).
// Set paths in workflow or leave unset to use marketplace extensions.
const vsixDir = path.resolve(import.meta.dirname, '.vsix');
const coreVsix = process.env.CORE_VSIX_PATH ?? (fs.existsSync(path.join(vsixDir, 'salesforcedx-vscode-core.vsix')) ? path.join(vsixDir, 'salesforcedx-vscode-core.vsix') : null);
const installExtensions = [
    coreVsix ?? 'salesforce.salesforcedx-vscode-core',
];

// Log source so CI logs show whether local VSIX or marketplace is used
console.log('[E2E] Core:', coreVsix ? `local VSIX (${coreVsix})` : 'marketplace');
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
     * Uses unpublished VSIXs from .vsix/ or env CORE_VSIX_PATH when present;
     * otherwise installs from marketplace. List order: Services first, then Core.
     */
    installExtensions,
    
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
        `--extensions-dir=${extensionsDir}`,
        `--user-data-dir=${userDataDir}`
    ]
});