import * as vscode from "vscode";
import * as semver from 'semver';
import * as Constants from "../constants";
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
import {
    LiveOrgCommunicationService,
    NoOpOrgCommunicationService,
    OrgCommunicationService,
    OrgCommunicationServiceProvider,
    WorkspaceContext
} from "./org-communication-service";
import { getErrorMessageWithStack } from "../utils";


const EXTENSION_THAT_SUPPLIES_LLM_SERVICE = 'salesforce.salesforcedx-einstein-gpt';
const EXTENSION_THAT_SUPPLIES_TELEMETRY_SERVICE = Constants.CORE_EXTENSION_ID;
const EXTENSION_THAT_SUPPLIES_WORKSPACE_CONTEXT = Constants.CORE_EXTENSION_ID;


/**
 * Provides and caches a number of external services that we use like the LLM service, telemetry service, etc.
 */
export class ExternalServiceProvider implements LLMServiceProvider, TelemetryServiceProvider, OrgCommunicationServiceProvider {
    private readonly logger: Logger;
    private readonly extensionContext: vscode.ExtensionContext;

    private cachedLLMService?: LLMService;
    private cachedTelemetryService?: TelemetryService;
    private cachedOrgCommunicationService?: OrgCommunicationService;

    constructor(logger: Logger, extensionContext: vscode.ExtensionContext) {
        this.logger = logger;
        this.extensionContext = extensionContext;
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
            this.logger.error(`Could not establish LLM service due to unexpected error:\n${getErrorMessageWithStack(err)}`);
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
            this.logger.debug('Could not establish the live telemetry service since it is not available. ' +
                'Most likely you do not have the "Salesforce CLI Integration" Core Extension installed in VS Code.');
            return new LogOnlyTelemetryService(this.logger);
        }

        try {
            const coreTelemetryService: TelemetryServiceInterface = await ServiceProvider.getService(ServiceType.Telemetry,
                Constants.EXTENSION_ID_WITHOUT_NAMESPACE); // The telemetry service seems to require the id without the namespace prefix
            await coreTelemetryService.initializeService(this.extensionContext);
            return new LiveTelemetryService(coreTelemetryService, this.logger);
        } catch (err) {
            this.logger.error(`Could not establish live telemetry service due to unexpected error:\n${getErrorMessageWithStack(err)}`);
            return new LogOnlyTelemetryService(this.logger);
        }
    }


    // =================================================================================================================
    // === OrgCommunicationServiceProvider implementation
    // =================================================================================================================
    async isOrgCommunicationServiceAvailable(): Promise<boolean> {
        const coreExtension: vscode.Extension<CoreExtensionApi> = await this.waitForExtensionToBeActivatedIfItExists(EXTENSION_THAT_SUPPLIES_WORKSPACE_CONTEXT);
        if (!coreExtension) {
            return false;
        }
        const pkgJson: {version: string} = coreExtension.packageJSON as {version: string};
        if (semver.lt(pkgJson.version, Constants.MINIMUM_REQUIRED_VERSION_CORE_EXTENSION)) {
            this.logger.warn(`The version of the extension '${EXTENSION_THAT_SUPPLIES_WORKSPACE_CONTEXT}' is below the minimum version required for Salesforce Code Analyzer to provide full functionality. Please upgrade to version ${Constants.MINIMUM_REQUIRED_VERSION_CORE_EXTENSION} or greater.`);
            return false;
        }
        return true;
    }

    async getOrgCommunicationService(): Promise<OrgCommunicationService> {
        if (!this.cachedOrgCommunicationService) {
            this.cachedOrgCommunicationService = await this.initializeOrgCommunicationService();
        }
        return this.cachedOrgCommunicationService;
    }

    private async initializeOrgCommunicationService(): Promise<OrgCommunicationService> {
        if (!(await this.isOrgCommunicationServiceAvailable())) {
            this.logger.debug('Could not establish the live org communication service since it is not available. ' +
                'Most likely you do not have the "Salesforce CLI Integration" Core Extension installed in VS Code.');
            return new NoOpOrgCommunicationService();
        }
        try {
            // Ideally we would get the WorkspaceContext from the ServiceProvider but it is not on the ServiceProvider.
            // So instead, we get it off of the core extension's returned api.
            const coreExtension: vscode.Extension<CoreExtensionApi> = vscode.extensions.getExtension(EXTENSION_THAT_SUPPLIES_WORKSPACE_CONTEXT);
            const workspaceContext: WorkspaceContext = coreExtension.exports.services.WorkspaceContext.getInstance();
            return new LiveOrgCommunicationService(workspaceContext);

        } catch (err) {
            this.logger.error(`Could not establish Org Communication service due to unexpected error:\n${getErrorMessageWithStack(err)}`);
            throw err;
        }
    }

    // =================================================================================================================

    // TODO: The following is a temporary workaround to the problem that our extension might activate before
    // the extension that provides a dependent service has activated. We wait for it to activate for up to 2 seconds if
    // it is available and after 2 seconds just force activate it. The service provider should do this automatically for
    // us. Until then, we'll keep this workaround in place (which is not preferred because it requires us to hard code
    // the extension name that each service comes from which theoretically could be subject to change over time).
    // Returns the extension if the extension activated and undefined if the extension doesn't exist or could not be activated.
    private async waitForExtensionToBeActivatedIfItExists<T>(extensionName: string): Promise<vscode.Extension<T> | undefined> {
        const extension: vscode.Extension<T> = vscode.extensions.getExtension(extensionName);
        if (!extension) {
            this.logger.debug(`The extension '${extensionName}' was not found. Some functionality that depends on this extension will not be available.`);
            return undefined;
        } else if (extension.isActive) {
            return extension;
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
            return extension;
        }

        // Ideally we shouldn't be force activating it, but it's the best thing we can do after waiting 2 seconds as a
        // last attempt to get the dependent extension's service available.
        this.logger.debug(`The extension '${extensionName}' has still has not activated. Attempting to force activate it.`);
        try {
            await extension.activate();
            this.logger.debug(`The extension '${extensionName}' has activated successfully.`);
            return extension;
        } catch (err) {
            const errMsg: string = err instanceof Error ? err.stack : String(err);
            this.logger.debug(`The extension '${extensionName}' could not activate due to an unexpected exception:\n${errMsg}`);
            return undefined;
        }
    }
}

// The only thing we care about from the returned Core Extension API is the WorkspaceContext service for now.
// See https://github.com/forcedotcom/salesforcedx-vscode/blob/develop/packages/salesforcedx-vscode-core/src/index.ts#L479
interface CoreExtensionApi {
    services: {
        WorkspaceContext: {
            getInstance(): WorkspaceContext;
        };
    }
}