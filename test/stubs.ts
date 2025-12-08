import * as vscode from "vscode";// The vscode module is mocked out. See: scripts/setup.jest.ts

import {TelemetryService} from "../src/lib/external-services/telemetry-service";
import {Logger} from "../src/lib/logger";
import {LLMService, LLMServiceProvider} from "../src/lib/external-services/llm-service";
import {Violation} from "../src/lib/diagnostics";
import {Display, DisplayButton} from "../src/lib/display";
import {UnifiedDiffService} from "../src/lib/unified-diff-service";
import {TextDocument} from "vscode";
import {SettingsManager} from "../src/lib/settings";
import {CodeAnalyzer} from "../src/lib/code-analyzer";
import {ProgressEvent, ProgressReporter, TaskWithProgress, TaskWithProgressRunner} from "../src/lib/progress";
import {CliCommandExecutor, CommandOutput, ExecOptions} from "../src/lib/cli-commands";
import * as semver from "semver";
import {FileHandler} from "../src/lib/fs-utils";
import {VscodeWorkspace, WindowManager} from "../src/lib/vscode-api";
import {Workspace} from "../src/lib/workspace";
import { ApexGuruAccess, ApexGuruAvailability, ApexGuruService } from "../src/lib/apexguru/apex-guru-service";
import { HttpRequest, OrgConnectionService, OrgUserInfo } from "../src/lib/external-services/org-connection-service";

export class SpyTelemetryService implements TelemetryService {
    sendExtensionActivationEventCallHistory: { hrStart: number }[] = [];

    sendExtensionActivationEvent(hrStart: number): void {
        this.sendExtensionActivationEventCallHistory.push({hrStart});
    }

    sendCommandEventCallHistory: { commandName: string, properties: Record<string, string> }[] = [];

    sendCommandEvent(commandName: string, properties: Record<string, string>): void {
        this.sendCommandEventCallHistory.push({commandName, properties});
    }

    sendExceptionCallHistory: { name: string, errorMessage: string, properties?: Record<string, string> }[] = [];

    sendException(name: string, errorMessage: string, properties?: Record<string, string>): void {
        this.sendExceptionCallHistory.push({name, errorMessage, properties});
    }
}

export class SpyLogger implements Logger {
    logAtLevelCallHistory: { logLevel: vscode.LogLevel, msg: string }[] = [];

    logAtLevel(logLevel: vscode.LogLevel, msg: string): void {
        this.logAtLevelCallHistory.push({logLevel, msg});
    }

    logCallHistory: { msg: string }[] = [];

    log(msg: string): void {
        this.logCallHistory.push({msg});
    }

    warnCallHistory: { msg: string }[] = [];

    warn(msg: string): void {
        this.warnCallHistory.push({msg});
    }

    errorCallHistory: { msg: string }[] = [];

    error(msg: string): void {
        this.errorCallHistory.push({msg});
    }

    debugCallHistory: { msg: string }[] = [];

    debug(msg: string): void {
        this.debugCallHistory.push({msg});
    }

    traceCallHistory: { msg: string }[] = [];

    trace(msg: string): void {
        this.traceCallHistory.push({msg});
    }
}

export class SpyDisplay implements Display {
    displayInfoCallHistory: { msg: string }[] = [];

    displayInfo(msg: string): void {
        this.displayInfoCallHistory.push({msg});
    }

    displayWarningCallHistory: { msg: string, buttons: DisplayButton[] }[] = [];

    displayWarning(msg: string, ...buttons: DisplayButton[]): void {
        this.displayWarningCallHistory.push({msg, buttons});
    }

    displayErrorCallHistory: { msg: string, buttons: DisplayButton[]  }[] = [];

    displayError(msg: string, ...buttons: DisplayButton[]): void {
        this.displayErrorCallHistory.push({msg, buttons});
    }
}

export class SpyLLMService implements LLMService {
    callLLMReturnValue: string = '{"fixedCode": "some code fix"}';
    callLLMCallHistory: { prompt: string, guidedJsonSchema?: string }[] = []

    callLLM(prompt: string, guidedJsonSchema?: string): Promise<string> {
        this.callLLMCallHistory.push({prompt, guidedJsonSchema});
        return Promise.resolve(this.callLLMReturnValue);
    }
}

export class ThrowingLLMService implements LLMService {
    callLLM(_prompt: string, _guidedJsonSchema?: string): Promise<string> {
        throw new Error("Error from callLLM");
    }
}

export class StubLLMServiceProvider implements LLMServiceProvider {
    private readonly llmService: LLMService;

    constructor(llmService: LLMService) {
        this.llmService = llmService;
    }

    isLLMServiceAvailableReturnValue: boolean = true;

    isLLMServiceAvailable(): Promise<boolean> {
        return Promise.resolve(this.isLLMServiceAvailableReturnValue);
    }

    getLLMService(): Promise<LLMService> {
        return Promise.resolve(this.llmService);
    }
}

export class ThrowingLLMServiceProvider implements LLMServiceProvider {
    getLLMService(): Promise<LLMService> {
        throw new Error("Error from getLLMService");
    }

    isLLMServiceAvailable(): Promise<boolean> {
        throw new Error("Error from isLLMServiceAvailable");
    }

}

export class StubCodeAnalyzer implements CodeAnalyzer {
    validateEnvironment(): Promise<void> {
        return Promise.resolve(); // No-op
    }

    scanReturnValue: Violation[] = [];

    scan(_workspace: Workspace): Promise<Violation[]> {
        return Promise.resolve(this.scanReturnValue);
    }

    getScannerNameReturnValue: string = 'dummyScannerName';

    getVersion(): Promise<string> {
        return Promise.resolve(this.getScannerNameReturnValue);
    }

    getRuleDescriptionForReturnValue: string = 'someRuleDescription';

    getRuleDescriptionFor(_engineName: string, _ruleName: string): Promise<string> {
        return Promise.resolve(this.getRuleDescriptionForReturnValue);
    }
}

export class ThrowingCodeAnalyzer implements CodeAnalyzer {
    validateEnvironment(): Promise<void> {
        throw new Error("Error from validateEnvironment");
    }

    scan(_workspace: Workspace): Promise<Violation[]> {
        throw new Error("Error from scan");
    }

    getVersion(): Promise<string> {
        return Promise.resolve('someScannerName');
    }

    getRuleDescriptionFor(_engineName: string, _ruleName: string): Promise<string> {
        throw new Error("Error from getRuleDescriptionFor.");
    }
}

export class SpyUnifiedDiffService implements UnifiedDiffService {
    register(): void {
        // no-op
    }

    dispose() {
        // no op
    }

    verifyCanShowDiffReturnValue: boolean = true;
    verifyCanShowDiffCallHistory: { document: TextDocument }[] = [];

    verifyCanShowDiff(document: TextDocument): boolean {
        this.verifyCanShowDiffCallHistory.push({document});
        return this.verifyCanShowDiffReturnValue;
    }

    showDiffCallHistory: {
        document: TextDocument,
        newCode: string,
        acceptCallback: () => Promise<void>,
        rejectCallback: () => Promise<void>
    }[] = [];

    showDiff(document: TextDocument, newCode: string, acceptCallback: () => Promise<void>, rejectCallback: () => Promise<void>): Promise<void> {
        this.showDiffCallHistory.push({document, newCode, acceptCallback, rejectCallback});
        return Promise.resolve();
    }
}

export class ThrowingUnifiedDiffService implements UnifiedDiffService {
    register(): void {
        // no-op
    }

    dispose() {
        // no-op
    }

    verifyCanShowDiff(_document: TextDocument): boolean {
        return true;
    }

    showDiff(_document: TextDocument, _newCode: string, _acceptCallback: () => Promise<void>, _rejectCallback: () => Promise<void>): Promise<void> {
        throw new Error('Error thrown from: showDiff');
    }
}


export class StubSettingsManager implements SettingsManager {

    // =================================================================================================================
    // ==== General Settings
    // =================================================================================================================
    getAnalyzeOnOpenReturnValue: boolean = false;

    getAnalyzeOnOpen(): boolean {
        return this.getAnalyzeOnOpenReturnValue;
    }

    getAnalyzeOnSaveReturnValue: boolean = false;

    getAnalyzeOnSave(): boolean {
        return this.getAnalyzeOnSaveReturnValue;
    }

    getAnalyzeAutomaticallyFileExtensionsReturnValue: Set<string> = new Set<string>();

    getAnalyzeAutomaticallyFileExtensions(): Set<string> {
        return this.getAnalyzeAutomaticallyFileExtensionsReturnValue;
    }

    // =================================================================================================================
    // ==== Configuration Settings
    // =================================================================================================================
    getCodeAnalyzerConfigFileReturnValue: string = '';

    getCodeAnalyzerConfigFile(): string {
        return this.getCodeAnalyzerConfigFileReturnValue;
    }

    getCodeAnalyzerRuleSelectorsReturnValue: string = 'Recommended';

    getCodeAnalyzerRuleSelectors(): string {
        return this.getCodeAnalyzerRuleSelectorsReturnValue;
    }

    getSeverityLevelReturnValue: vscode.DiagnosticSeverity = vscode.DiagnosticSeverity.Warning;

    getSeverityLevel(_severity: number): vscode.DiagnosticSeverity {
        return this.getSeverityLevelReturnValue;
    }

    // =================================================================================================================
    // ==== Other Settings that we may depend on
    // =================================================================================================================
    getEditorCodeLensEnabledReturnValue: boolean = true;

    getEditorCodeLensEnabled(): boolean {
        return this.getEditorCodeLensEnabledReturnValue;
    }
}


export class SpyProgressReporter implements ProgressReporter {
    reportProgressCallHistory: { progressEvent: ProgressEvent }[] = [];

    reportProgress(progressEvent: ProgressEvent): void {
        this.reportProgressCallHistory.push({progressEvent});
    }
}

export class FakeTaskWithProgressRunner implements TaskWithProgressRunner {
    progressReporter: SpyProgressReporter = new SpyProgressReporter();

    runTask(task: TaskWithProgress): Promise<void> {
        return Promise.resolve(task(this.progressReporter));
    }
}


export class StubVscodeWorkspace implements VscodeWorkspace {
    getWorkspaceFoldersReturnValue: string[] = [];

    getWorkspaceFolders(): string[] {
        return this.getWorkspaceFoldersReturnValue;
    }
}


export class StubSpyCliCommandExecutor implements CliCommandExecutor {
    isSfInstalledReturnValue: boolean = true;
    isSfInstalled(): Promise<boolean> {
        return Promise.resolve(this.isSfInstalledReturnValue);
    }

    getSfCliPluginVersionReturnValue: semver.SemVer | undefined = new semver.SemVer('5.0.0-beta.3');
    getSfCliPluginVersionCallHistory: {pluginName: string}[] = [];
    getSfCliPluginVersion(pluginName: string): Promise<semver.SemVer | undefined> {
        this.getSfCliPluginVersionCallHistory.push({pluginName});
        return Promise.resolve(this.getSfCliPluginVersionReturnValue);
    }

    execReturnValue: CommandOutput = {stdout: '', stderr: '', exitCode: 0};
    execCallHistory: {command: string, args: string[], options?: ExecOptions}[] = [];
    exec(command: string, args: string[], options?: ExecOptions): Promise<CommandOutput> {
        this.execCallHistory.push({command, args, options});
        return Promise.resolve(this.execReturnValue);
    }
}


export class StubFileHandler implements FileHandler {
    existsReturnValue: boolean = true;
    exists(_path: string): Promise<boolean> {
        return Promise.resolve(this.existsReturnValue);
    }

    isDirReturnValue: boolean = false;
    isDir(_path: string): Promise<boolean> {
        return Promise.resolve(this.isDirReturnValue);
    }

    createTempFileReturnValue: string = '';
    createTempFile(_ext?: string): Promise<string> {
        return Promise.resolve(this.createTempFileReturnValue);
    }

    readFileReturnValue: string = '';
    readFile(_file: string): Promise<string> {
        return Promise.resolve(this.readFileReturnValue);
    }
}

export class SpyWindowManager implements WindowManager {
    showLogOutputWindowCallCount: number = 0;
    showLogOutputWindow(): void {
        this.showLogOutputWindowCallCount++;
    }

    showExternalUrlCallHistory: {url:string}[] = [];
    showExternalUrl(url: string): void {
        this.showExternalUrlCallHistory.push({url});
    }
}

export class StubApexGuruService implements ApexGuruService {
    getAvailabilityReturnValue: ApexGuruAvailability = {
        access: ApexGuruAccess.ENABLED,
        message: "ApexGuru access is enabled."
    };
    getAvailability(): ApexGuruAvailability {
        return this.getAvailabilityReturnValue;
    }

    updateAvailability(): Promise<void> {
        throw new Error("This Stubbed method has not been implemented since it isn't used in testing yet.");
    }

    onAccessChange(_callback: (access: ApexGuruAccess) => void): void {
        throw new Error("This Stubbed method has not been implemented since it isn't used in testing yet.");
    }

    scanReturnValue: Violation[] = [];
    scan(_absFileToScan: string): Promise<Violation[]> {
        return Promise.resolve(this.scanReturnValue);
    }
}

export class ThrowingScanApexGuruService extends StubApexGuruService {
    scan(_absFileToScan: string): Promise<Violation[]> {
        throw new Error("Sample error message from scan method");
    }
}

export class StubOrgConnectionService implements OrgConnectionService {
    isAuthedReturnValue: boolean = true;

    isAuthed(): boolean {
        return this.isAuthedReturnValue;
    }

    getApiVersion(): Promise<string> {
        return Promise.resolve('64.0');
    }

    onOrgChange(_callback: (orgUserInfo: OrgUserInfo) => void): void {
        // No-op
    }

    request<T>(requestOptions: HttpRequest): Promise<T> {
        throw new Error(`Not implemented:\n${JSON.stringify(requestOptions, null, 2)}`);
    }
}
