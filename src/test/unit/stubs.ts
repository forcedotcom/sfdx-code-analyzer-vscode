import {TelemetryService} from "../../lib/external-services/telemetry-service";
import {Logger} from "../../lib/logger";
import {LLMService, LLMServiceProvider} from "../../lib/external-services/llm-service";
import {CodeAnalyzerDiagnostic, Violation} from "../../lib/diagnostics";
import {Display} from "../../lib/display";
import {UnifiedDiffService} from "../../lib/unified-diff-service";
import {TextDocument} from "vscode";
import {FixSuggester, FixSuggestion} from "../../lib/fix-suggestion";
import {SettingsManager} from "../../lib/settings";
import {CodeAnalyzer} from "../../lib/code-analyzer";
import {ProgressEvent, ProgressReporter, TaskWithProgress, TaskWithProgressRunner} from "../../lib/progress";


export class SpyTelemetryService implements TelemetryService {
    sendExtensionActivationEventCallHistory: { hrStart: [number, number] }[] = [];

    sendExtensionActivationEvent(hrStart: [number, number]): void {
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

    displayWarningCallHistory: { msg: string }[] = [];

    displayWarning(msg: string): void {
        this.displayWarningCallHistory.push({msg});
    }

    displayErrorCallHistory: { msg: string }[] = [];

    displayError(msg: string): void {
        this.displayErrorCallHistory.push({msg});
    }
}

export class SpyLLMService implements LLMService {
    callLLMReturnValue: string = 'dummyReturnValue';
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

    scan(_filesToScan: string[]): Promise<Violation[]> {
        return Promise.resolve(this.scanReturnValue);
    }

    getScannerNameReturnValue: string = 'dummyScannerName';

    getScannerName(): string {
        return this.getScannerNameReturnValue;
    }

    getRuleDescriptionFor(_engineName: string, _ruleName: string): Promise<string> {
        return Promise.resolve('');
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


export class SpyFixSuggester implements FixSuggester {
    suggestFixReturnValue: FixSuggestion | null = null;
    suggestFixCallHistory: { document: TextDocument, diagnostic: CodeAnalyzerDiagnostic }[] = [];

    suggestFix(document: TextDocument, diagnostic: CodeAnalyzerDiagnostic): Promise<FixSuggestion | null> {
        this.suggestFixCallHistory.push({document, diagnostic});
        return Promise.resolve(this.suggestFixReturnValue);
    }
}

export class ThrowingFixSuggester implements FixSuggester {
    suggestFix(_document: TextDocument, _diagnostic: CodeAnalyzerDiagnostic): Promise<FixSuggestion | null> {
        throw new Error('Error thrown from: suggestFix');
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

    getApexGuruEnabledReturnValue: boolean = false;

    getApexGuruEnabled(): boolean {
        return this.getApexGuruEnabledReturnValue;
    }

    getCodeAnalyzerUseV4DeprecatedReturnValue: boolean = false;

    getCodeAnalyzerUseV4Deprecated(): boolean {
        return this.getCodeAnalyzerUseV4DeprecatedReturnValue;
    }

    setCodeAnalyzerUseV4Deprecated(value: boolean): void {
        this.getCodeAnalyzerUseV4DeprecatedReturnValue = value;
    }

    // =================================================================================================================
    // ==== v5 Settings
    // =================================================================================================================
    getCodeAnalyzerConfigFileReturnValue: string = '';

    getCodeAnalyzerConfigFile(): string {
        return this.getCodeAnalyzerConfigFileReturnValue;
    }

    getCodeAnalyzerRuleSelectorsReturnValue: string = 'Recommended';

    getCodeAnalyzerRuleSelectors(): string {
        return this.getCodeAnalyzerRuleSelectorsReturnValue;
    }

    // =================================================================================================================
    // ==== v4 Settings (Deprecated)
    // =================================================================================================================
    getPmdCustomConfigFile(): string {
        throw new Error("Method not implemented.");
    }

    getGraphEngineDisableWarningViolations(): boolean {
        throw new Error("Method not implemented.");
    }

    getGraphEngineThreadTimeout(): number {
        throw new Error("Method not implemented.");
    }

    getGraphEnginePathExpansionLimit(): number {
        throw new Error("Method not implemented.");
    }

    getGraphEngineJvmArgs(): string {
        throw new Error("Method not implemented.");
    }

    getEnginesToRun(): string {
        throw new Error("Method not implemented.");
    }

    getNormalizeSeverityEnabled(): boolean {
        throw new Error("Method not implemented.");
    }

    getRulesCategory(): string {
        throw new Error("Method not implemented.");
    }

    getSfgePartialSfgeRunsEnabled(): boolean {
        throw new Error("Method not implemented.");
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
    reportProgressCallHistory: {progressEvent: ProgressEvent}[] = [];
    reportProgress(progressEvent: ProgressEvent): void {
        this.reportProgressCallHistory.push({progressEvent});
    }
}

export class FakeTaskWithProgressRunner implements TaskWithProgressRunner {
    progressReporter: SpyProgressReporter = new SpyProgressReporter();

    runTask(task: TaskWithProgress): Promise<void> {
        return task(this.progressReporter);
    }
}
