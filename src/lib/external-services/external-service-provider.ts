import {
    LLMServiceInterface,
    ServiceProvider,
    ServiceType,
    TelemetryServiceInterface
} from "@salesforce/vscode-service-provider";
import {
    LiveTelemetryService,
    LogOnlyTelemetryService,
    TelemetryService,
    TelemetryServiceProvider
} from "./telemetry-service";
import {Logger} from "../logger";
import {LiveLLMService, LLMService, LLMServiceProvider} from "./llm-service";
import {Extension} from "vscode";
import * as vscode from "vscode";
import * as Constants from "../constants";

const EXTENSION_THAT_SUPPLIES_LLM_SERVICE = 'salesforce.salesforcedx-einstein-gpt';
const EXTENSION_THAT_SUPPLIES_TELEMETRY_SERVICE = 'salesforce.salesforcedx-vscode-core';


/**
 * Provides and caches a number of external services that we use like the LLM service, telemetry service, etc.
 */
export class ExternalServiceProvider implements LLMServiceProvider, TelemetryServiceProvider {
    private readonly logger: Logger;

    private cachedLLMService?: LLMService;
    private cachedTelemetryService?: TelemetryService;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    // =================================================================================================================
    // === LLMServiceProvider implementation
    // =================================================================================================================

    async isLLMServiceAvailable(): Promise<boolean> {
        return (await this.waitForExtensionToBeActivatedIfItExists(EXTENSION_THAT_SUPPLIES_LLM_SERVICE)) &&
            (await ServiceProvider.isServiceAvailable(ServiceType.LLMService));
    }

    async getLLMService(): Promise<LLMService> {
        if (!this.cachedLLMService) {
            this.cachedLLMService = await this.initializeLLMService();
        }
        return this.cachedLLMService;
    }

    private async initializeLLMService(): Promise<LLMService> {
        if (!(await this.isLLMServiceAvailable())) {
            throw new Error("The initializeLLMService method should not be called if the LLM Service is unavailable.");
        }
        try {
            const coreLLMService: LLMServiceInterface = await ServiceProvider.getService(ServiceType.LLMService, Constants.EXTENSION_ID);
            return new LiveLLMService(coreLLMService, this.logger);
        } catch (err) {
            const errMsg: string = err instanceof Error? err.stack : String(err);
            this.logger.error(`Could not establish LLM service due to unexpected error:\n${errMsg}`);
            throw err;
        }
    }

    // =================================================================================================================
    // === TelemetryServiceProvider implementation
    // =================================================================================================================

    async isTelemetryServiceAvailable(): Promise<boolean> {
        return (await this.waitForExtensionToBeActivatedIfItExists(EXTENSION_THAT_SUPPLIES_TELEMETRY_SERVICE)) &&
            (await ServiceProvider.isServiceAvailable(ServiceType.Telemetry));
    }

    async getTelemetryService(): Promise<TelemetryService> {
        if (!this.cachedTelemetryService) {
            this.cachedTelemetryService = await this.initializeTelemetryService();
        }
        return this.cachedTelemetryService;
    }

    private async initializeTelemetryService(): Promise<TelemetryService> {
        if (!(await this.isTelemetryServiceAvailable())) {
            this.logger.debug('Could not establish live telemetry service since it is not available. ' +
                'Most likely you do not have the "Salesforce CLI Integration" Core Extension installed in VS Code.');
            return new LogOnlyTelemetryService(this.logger);
        }

        try {
            const coreTelemetryService: TelemetryServiceInterface = await ServiceProvider.getService(ServiceType.Telemetry, Constants.EXTENSION_ID);
            return new LiveTelemetryService(coreTelemetryService, this.logger);
        } catch (err) {
            const errMsg: string = err instanceof Error? err.stack : String(err);
            this.logger.error(`Could not establish live telemetry service due to unexpected error:\n${errMsg}`);
            return new LogOnlyTelemetryService(this.logger);
        }
    }


    // =================================================================================================================

    // TODO: The following is a temporary workaround to the problem that our extension might activate before
    // the extension that provides a dependent service has activated. We wait for it to activate for up to 2 seconds if
    // it is available and after 2 seconds just force activate it. The service provider should do this automatically for
    // us. Until then, we'll keep this workaround in place (which is not preferred because it requires us to hard code
    // the extension name that each service comes from which theoretically could be subject to change over time).
    // Returns true if the extension activated and false if the extension doesn't exist or could not be activated.
    private async waitForExtensionToBeActivatedIfItExists(extensionName: string): Promise<boolean> {
        const extension: Extension<unknown> = vscode.extensions.getExtension(extensionName);
        if (!extension) {
            this.logger.debug(`The extension '${extensionName}' was not found. Some functionality that depends on this extension will not be available.`);
            return false;
        } else if (extension.isActive) {
            return true;
        }

        this.logger.debug(`The extension '${extensionName}' was found but has not yet activated. Waiting up to 5 seconds for it to activate.`);
        const eventuallyBecameActive: boolean = await new Promise(resolve => {
            const interval = setInterval(() => {
                if (extension.isActive) {
                    clearInterval(interval);
                    resolve(true);
                }
            }, 50); // Check every 50ms
            setTimeout(() => {
                clearInterval(interval);
                resolve(false);
            }, 5000); // Timeout after 5 seconds
        });

        if (eventuallyBecameActive) {
            this.logger.debug(`The extension '${extensionName}' has activated successfully.`);
            return true;
        }

        // Ideally we shouldn't be force activating it, but it's the best thing we can do after waiting 2 seconds as a
        // last attempt to get the dependent extension's service available.
        this.logger.debug(`The extension '${extensionName}' has still has not activated. Attempting to force activate it.`);
        try {
            await extension.activate();
            this.logger.debug(`The extension '${extensionName}' has activated successfully.`);
            return true;
        } catch (err) {
            const errMsg: string = err instanceof Error ? err.stack : String(err);
            this.logger.debug(`The extension '${extensionName}' could not activate due to an unexpected exception:\n${errMsg}`);
            return false;
        }
    }
}
