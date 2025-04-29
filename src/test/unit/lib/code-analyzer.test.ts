import {CodeAnalyzer, CodeAnalyzerImpl} from "../../../lib/code-analyzer";
import * as semver from "semver";
import * as stubs from "../stubs";
import {messages} from "../../../lib/messages";
import {Violation} from "../../../lib/diagnostics";
import * as path from "path";

const TEST_DATA_DIR: string = path.resolve(__dirname, '..', 'test-data');

describe('Tests for the CodeAnalyzerImpl class', () => {
    let cliCommandExecutor: stubs.StubSpyCliCommandExecutor;
    let settingsManager: stubs.StubSettingsManager;
    let display: stubs.SpyDisplay;
    let vscodeWorkspace: stubs.StubVscodeWorkspace;
    let fileHandler: stubs.StubFileHandler;
    let codeAnalyzer: CodeAnalyzer;

    beforeEach(() => {
        cliCommandExecutor = new stubs.StubSpyCliCommandExecutor();
        settingsManager = new stubs.StubSettingsManager();
        display = new stubs.SpyDisplay();
        vscodeWorkspace = new stubs.StubVscodeWorkspace();
        fileHandler = new stubs.StubFileHandler();
        codeAnalyzer = new CodeAnalyzerImpl(cliCommandExecutor, settingsManager, display, vscodeWorkspace, fileHandler);
    });

    describe('v5 tests', () => {
        describe('v5 tests for the validateEnvironment method', () => {
            it('When the Salesforce CLI is not installed, then error', async () => {
                cliCommandExecutor.isSfInstalledReturnValue = false;
                await expect(codeAnalyzer.validateEnvironment()).rejects.toThrow(messages.error.sfMissing);
            });

            it('When the code-analyzer plugin is not installed, then error', async () => {
                cliCommandExecutor.getSfCliPluginVersionReturnValue = undefined;
                await expect(codeAnalyzer.validateEnvironment()).rejects.toThrow(
                    messages.codeAnalyzer.codeAnalyzerMissing + '\n' + messages.codeAnalyzer.installLatestVersion);
            });

            it('When the code-analyzer plugin is installed, but the version does not meat the minimum required, then error', async () => {
                cliCommandExecutor.getSfCliPluginVersionReturnValue = new semver.SemVer('5.0.0-alpha.1');
                await expect(codeAnalyzer.validateEnvironment()).rejects.toThrow(
                    messages.codeAnalyzer.doesNotMeetMinVersion('5.0.0-alpha.1', '5.0.0') + '\n'
                    + messages.codeAnalyzer.installLatestVersion);
            });

            it('When the code-analyzer plugin is installed, but the version is only partially supported, then warn', async () => {
                cliCommandExecutor.getSfCliPluginVersionReturnValue = new semver.SemVer('5.0.0-beta.2');
                await codeAnalyzer.validateEnvironment();
                expect(display.displayWarningCallHistory).toHaveLength(1);
                expect(display.displayWarningCallHistory[0].msg).toEqual(
                    messages.codeAnalyzer.usingOlderVersion('5.0.0-beta.2', '5.0.0') + '\n'
                    + messages.codeAnalyzer.installLatestVersion);
            });

            it('When the code-analyzer plugin is installed with at least the minimum recommended version, then no error and no warning', async () => {
                cliCommandExecutor.getSfCliPluginVersionReturnValue = new semver.SemVer('5.0.0');
                await codeAnalyzer.validateEnvironment();
                expect(display.displayErrorCallHistory).toHaveLength(0);
                expect(display.displayWarningCallHistory).toHaveLength(0);
            });
        });

        describe('v5 tests for the getScannerName method', () => {
            it('Sanity check that getScannerName first calls validateEnvironment', async () => {
                cliCommandExecutor.isSfInstalledReturnValue = false;
                await expect(codeAnalyzer.getScannerName()).rejects.toThrow(messages.error.sfMissing);
            });

            it('The name reflects the currently set v5 version', async () => {
                cliCommandExecutor.getSfCliPluginVersionReturnValue = new semver.SemVer('5.0.0-beta.3');
                const scannerName: string = await codeAnalyzer.getScannerName();
                expect(scannerName).toEqual('code-analyzer@5.0.0-beta.3 via CLI');
            });
        });

        describe('v5 tests for the scan method', () => {
            const expectedViolation1: Violation = {
                engine: "eslint",
                locations: [
                    {
                        endColumn: 49,
                        endLine: 3,
                        file: path.normalize("/my/project/dummyFile1.js"),
                        startColumn: 9,
                        startLine: 3
                    }
                ],
                message: "Unexpected var, use let or const instead.",
                primaryLocationIndex: 0,
                resources: ["https://eslint.org/docs/latest/rules/no-var"],
                rule: "no-var",
                severity: 3,
                tags: ["Recommended", "BestPractices", "JavaScript", "TypeScript"]
            };
            const expectedViolation2: Violation = {
                engine: "sfge",
                locations: [
                    {
                        file: path.normalize("/my/project/dummyFile2.cls"),
                        startColumn: 31,
                        startLine: 37
                    },
                    {
                        file: path.normalize("/my/project/dummyFile2.cls"),
                        startColumn: 41,
                        startLine: 19
                    }
                ],
                message: "FLS validation is missing for [READ] operation on [Bot_Command__c] with field(s) [Active__c,apex_class__c,Name,pattern__c].",
                primaryLocationIndex: 1,
                resources: [],
                rule: "ApexFlsViolationRule",
                severity: 2,
                tags: ["DevPreview", "Security", "Apex"]
            };

            const prePopulatedResultsJsonFile: string = path.join(TEST_DATA_DIR, 'sample-code-analyzer-run-output.json');

            it('Sanity check that scan first calls validateEnvironment', async () => {
                cliCommandExecutor.isSfInstalledReturnValue = false;
                await expect(codeAnalyzer.scan([])).rejects.toThrow(messages.error.sfMissing);
            });

            it('When running a scan with a beta version of v5, then confirm we call the cli and process the results correctly using only --workspace', async () => {
                vscodeWorkspace.getWorkspaceFoldersReturnValue = ['/my/project'];
                cliCommandExecutor.getSfCliPluginVersionReturnValue = new semver.SemVer('5.0.0-beta.3');

                // Set up the file handler to point to a prepopulated results json file instead of actually calling the cli:
                fileHandler.createTempFileReturnValue = prePopulatedResultsJsonFile;

                // Call scan
                const violations: Violation[] = await codeAnalyzer.scan(['/my/project/dummyFile1.cls', '/my/project/dummyFile2.cls']);

                // First check that we are passing the correct arguments to the cli
                expect(cliCommandExecutor.execCallHistory).toHaveLength(1);
                expect(cliCommandExecutor.execCallHistory[0].command).toEqual('sf');
                expect(cliCommandExecutor.execCallHistory[0].args).toEqual([
                    "code-analyzer", "run",
                    "-w", "/my/project/dummyFile1.cls",
                    "-w", "/my/project/dummyFile2.cls",
                    "-r", "Recommended",
                    "-f", prePopulatedResultsJsonFile
                ]);

                expect(violations).toEqual([expectedViolation1, expectedViolation2]);
            });

            it('When running a scan with version 5.0.0, then confirm we call the cli and process the results correctly using both --workspace and --target', async () => {
                vscodeWorkspace.getWorkspaceFoldersReturnValue = ['/my/project', '/my/project2'];
                cliCommandExecutor.getSfCliPluginVersionReturnValue = new semver.SemVer('5.0.0');

                // Set up the file handler to point to a prepopulated results json file instead of actually calling the cli:
                fileHandler.createTempFileReturnValue = prePopulatedResultsJsonFile;

                // Call scan
                const violations: Violation[] = await codeAnalyzer.scan(['/my/project/dummyFile1.cls', '/my/project/dummyFile2.cls']);

                // First check that we are passing the correct arguments to the cli
                expect(cliCommandExecutor.execCallHistory).toHaveLength(1);
                expect(cliCommandExecutor.execCallHistory[0].command).toEqual('sf');
                expect(cliCommandExecutor.execCallHistory[0].args).toEqual([
                    "code-analyzer", "run",
                    "-w", "/my/project", // Should always include the workspace folders
                    "-w", "/my/project2",
                    "-w", "/my/project/dummyFile1.cls", // Sanity check that we always include the files as well just in case they don't live under the workspace
                    "-w", "/my/project/dummyFile2.cls",
                    "-t", "/my/project/dummyFile1.cls",
                    "-t", "/my/project/dummyFile2.cls",
                    "-r", "Recommended",
                    "-f", prePopulatedResultsJsonFile
                ]);

                expect(violations).toEqual([expectedViolation1, expectedViolation2]);
            });

            it('When no vscode workspace exist because the user probably just opened a single file, verify the files make up the workspace', async () => {
                vscodeWorkspace.getWorkspaceFoldersReturnValue = [];
                cliCommandExecutor.getSfCliPluginVersionReturnValue = new semver.SemVer('5.1.0');

                // Set up the file handler to point to a prepopulated results json file instead of actually calling the cli:
                fileHandler.createTempFileReturnValue = prePopulatedResultsJsonFile;

                // Call scan
                const violations: Violation[] = await codeAnalyzer.scan(['/my/project/dummyFile1.cls', '/my/project/dummyFile2.cls', '/my/project/subfolder']);

                // First check that we are passing the correct arguments to the cli
                expect(cliCommandExecutor.execCallHistory).toHaveLength(1);
                expect(cliCommandExecutor.execCallHistory[0].command).toEqual('sf');
                expect(cliCommandExecutor.execCallHistory[0].args).toEqual([
                    "code-analyzer", "run",
                    "-w", "/my/project/dummyFile1.cls",
                    "-w", "/my/project/dummyFile2.cls",
                    "-w", "/my/project/subfolder",
                    "-t", "/my/project/dummyFile1.cls",
                    "-t", "/my/project/dummyFile2.cls",
                    "-t", "/my/project/subfolder",
                    "-r", "Recommended",
                    "-f", prePopulatedResultsJsonFile
                ]);

                expect(violations).toEqual([expectedViolation1, expectedViolation2]);
            });

            // TODO: More tests coming soon...
            //   For example, confirm we are using rule selector settings and config file, test error handling from cli,
            //   when JSON file doesn't parse, etc
        });

        describe('v5 tests for the getRuleDescriptionFor method', () => {
            const prePopulatedRuleDescriptionJsonFile: string = path.join(TEST_DATA_DIR, 'sample-code-analyzer-rules-output.json');

            it('Sanity check that getRuleDescriptionFor first calls validateEnvironment', async () => {
                cliCommandExecutor.isSfInstalledReturnValue = false;
                await expect(codeAnalyzer.getRuleDescriptionFor('someEngine','someRule')).rejects.toThrow(messages.error.sfMissing);
            });

            it('When asking for a description from an known engine and rule, then its description is returned', async () => {
                // Set up the file handler to point to a prepopulated rules json file instead of actually calling the cli:
                fileHandler.createTempFileReturnValue = prePopulatedRuleDescriptionJsonFile;

                const ruleDescription1: string = await codeAnalyzer.getRuleDescriptionFor('someEngine', 'someRule1');

                // First check that we are passing the correct arguments to the cli
                expect(cliCommandExecutor.execCallHistory).toHaveLength(1);
                expect(cliCommandExecutor.execCallHistory[0].command).toEqual('sf');
                expect(cliCommandExecutor.execCallHistory[0].args).toEqual([
                    "code-analyzer", "rules",
                    "-r", "all",
                    "-f", prePopulatedRuleDescriptionJsonFile
                ]);

                // Then confirm that we get the correct description back
                expect(ruleDescription1).toEqual('some description for someRule1');

                // Lastly, confirm that if we call getRuleDescriptionFor again that we do not call the CLI again
                expect(cliCommandExecutor.execCallHistory).toHaveLength(1); // Should still be 1
                const ruleDescription2: string = await codeAnalyzer.getRuleDescriptionFor('someEngine', 'someRule2');
                expect(ruleDescription2).toEqual('some description for someRule2');

            });

            it('When asking for a description from an unknown engine or rule, then empty string is returned', async () => {
                // Set up the file handler to point to a prepopulated rules json file instead of actually calling the cli:
                fileHandler.createTempFileReturnValue = prePopulatedRuleDescriptionJsonFile;

                const ruleDescription: string = await codeAnalyzer.getRuleDescriptionFor('unknown', 'unknown');

                // First check that we are passing the correct arguments to the cli
                expect(cliCommandExecutor.execCallHistory).toHaveLength(1);
                expect(cliCommandExecutor.execCallHistory[0].command).toEqual('sf');
                expect(cliCommandExecutor.execCallHistory[0].args).toEqual([
                    "code-analyzer", "rules",
                    "-r", "all",
                    "-f", prePopulatedRuleDescriptionJsonFile
                ]);

                // Then confirm that we get empty
                expect(ruleDescription).toEqual('');
            });

            // TODO: More tests coming soon...
            //   For example, test error handling from cli, when JSON output file doesn't parse, etc
        });
    });

    describe('When using the "Use v4 (Deprecated)" setting ...', () => {
        beforeEach(() => {
            settingsManager.getCodeAnalyzerUseV4DeprecatedReturnValue = true;
        });

        describe('v4 tests for the validateEnvironment method', () => {
            it('When the Salesforce CLI is not installed, then error', async () => {
                cliCommandExecutor.isSfInstalledReturnValue = false;
                await expect(codeAnalyzer.validateEnvironment()).rejects.toThrow(messages.error.sfMissing);
            });

            it('When the scanner plugin is not installed, then error', async () => {
                cliCommandExecutor.getSfCliPluginVersionReturnValue = undefined;
                await expect(codeAnalyzer.validateEnvironment()).rejects.toThrow(messages.error.sfdxScannerMissing);
            });

            it('When the scanner plugin is installed, then no error and no warning', async () => {
                cliCommandExecutor.getSfCliPluginVersionReturnValue = new semver.SemVer('4.9.0');
                await codeAnalyzer.validateEnvironment();
                expect(display.displayErrorCallHistory).toHaveLength(0);
                expect(display.displayWarningCallHistory).toHaveLength(0);
            });
        });

        describe('v4 tests for the getScannerName method', () => {
            it('Sanity check that getScannerName first calls validateEnvironment', async () => {
                cliCommandExecutor.isSfInstalledReturnValue = false;
                await expect(codeAnalyzer.getScannerName()).rejects.toThrow(messages.error.sfMissing);
            });

            it('When he scanner name reflects the v4 version', async () => {
                settingsManager.getCodeAnalyzerUseV4DeprecatedReturnValue = true;
                cliCommandExecutor.getSfCliPluginVersionReturnValue = new semver.SemVer('4.5.0');
                const scannerName: string = await codeAnalyzer.getScannerName();
                expect(scannerName).toEqual('@salesforce/sfdx-scanner@4.5.0 via CLI');
            });
        });

        describe('v4 tests for the scan method', () => {
            it('Sanity check that scan first calls validateEnvironment', async () => {
                cliCommandExecutor.isSfInstalledReturnValue = false;
                await expect(codeAnalyzer.scan([])).rejects.toThrow(messages.error.sfMissing);
            });

            // TODO: More tests coming soon ...
        });

        describe('v4 tests for the getRuleDescriptionFor method', () => {
            it('Sanity check that getRuleDescriptionFor first calls validateEnvironment', async () => {
                cliCommandExecutor.isSfInstalledReturnValue = false;
                await expect(codeAnalyzer.getRuleDescriptionFor('someEngine','someRule')).rejects.toThrow(messages.error.sfMissing);
            });

            it('When getRuleDescriptionFor is called, then it always just returns empty since this is bonus functionality for A4D', async () => {
                const description: string = await codeAnalyzer.getRuleDescriptionFor('pmd', 'ApexDoc');
                expect(description).toEqual('');
            });
        });
    });
});
