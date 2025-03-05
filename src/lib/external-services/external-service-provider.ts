import {
	LLMServiceInterface,
	ServiceProvider,
	ServiceType,
	TelemetryServiceInterface
} from "@salesforce/vscode-service-provider";
import {LiveTelemetryService, LogOnlyTelemetryService, TelemetryService} from "./telemetry-service";
import {Logger} from "../logger";
import {LiveLLMService, LLMService} from "./llm-service";

/**
 * Provides and caches a number of external services that we use like the LLM service, telemetry service, etc.
 */
export class ExternalServiceProvider {
	private readonly logger: Logger;

	private cachedLLMService?: LLMService;
	private cachedTelemetryService?: TelemetryService;

	constructor(logger: Logger) {
		this.logger = logger;
	}

	async isLLMServiceAvailable(): Promise<boolean> {
		return await ServiceProvider.isServiceAvailable(ServiceType.LLMService);
	}

	async isTelemetryServiceAvailable(): Promise<boolean> {
		return await ServiceProvider.isServiceAvailable(ServiceType.Telemetry);
	}

	async getLLMService(): Promise<LLMService> {
		if (!this.cachedLLMService) {
			this.cachedLLMService = await this.initializeLLMService();
		}
		return this.cachedLLMService;
	}

	async getTelemetryService(): Promise<TelemetryService> {
		if (!this.cachedTelemetryService) {
			this.cachedTelemetryService = await this.initializeTelemetryService();
		}
		return this.cachedTelemetryService;
	}

	private async initializeLLMService(): Promise<LLMService> {
		if (!(await this.isLLMServiceAvailable())) {
			throw new Error("The initializeLLMService method should not be called if the LLM Service is unavailable.");
		}
		try {
			const coreLLMService: LLMServiceInterface = await ServiceProvider.getService(ServiceType.LLMService);
			return new LiveLLMService(coreLLMService, this.logger);
		} catch (err) {
			const errMsg: string = err instanceof Error? err.stack : String(err);
			this.logger.error(`Could not establish LLM service due to unexpected error:\n${errMsg}`);
			throw err;
		}
	}

	private async initializeTelemetryService(): Promise<TelemetryService> {
		if (!(await this.isTelemetryServiceAvailable())) {
			this.logger.debug('Could not establish live telemetry service since it is not available. ' +
				'Most likely you do not have the "Salesforce CLI Integration" Core Extension installed in VS Code.');
			return new LogOnlyTelemetryService(this.logger);
		}

		try {
			const coreTelemetryService: TelemetryServiceInterface = await ServiceProvider.getService(ServiceType.Telemetry);
			return new LiveTelemetryService(coreTelemetryService, this.logger);
		} catch (err) {
			const errMsg: string = err instanceof Error? err.stack : String(err);
			this.logger.error(`Could not establish live telemetry service due to unexpected error:\n${errMsg}`);
			return new LogOnlyTelemetryService(this.logger);
		}
	}
}
