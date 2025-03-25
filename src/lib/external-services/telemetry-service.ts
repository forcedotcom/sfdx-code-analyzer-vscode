import {TelemetryServiceInterface} from "@salesforce/vscode-service-provider";
import {Logger} from "../logger";

/**
 * To buffer ourselves from having to mock out the TelemetryServiceInterface, we instead create our own
 * TelemetryService interface with only the methods that we care to use with the signatures that are best for us.
 */
export interface TelemetryService {
    sendExtensionActivationEvent(hrStart: [number, number]): void;
    sendCommandEvent(commandName: string, properties: Record<string, string>): void;
    sendException(name: string, errorMessage: string, properties?: Record<string, string>): void;
}

export interface TelemetryServiceProvider {
    isTelemetryServiceAvailable(): Promise<boolean>
    getTelemetryService(): Promise<TelemetryService>
}


export class LiveTelemetryService implements TelemetryService {
    // Delegates to the core telemetry service
    // See https://github.com/forcedotcom/salesforcedx-vscode/blob/develop/packages/salesforcedx-utils-vscode/src/services/telemetry.ts#L78
    // and https://github.com/forcedotcom/salesforcedx-vscode/blob/develop/packages/salesforcedx-vscode-core/src/services/telemetry/telemetryServiceProvider.ts#L19
    private readonly coreTelemetryService: TelemetryServiceInterface;
    private readonly logger: Logger;

    constructor(coreTelemetryService: TelemetryServiceInterface, logger: Logger) {
        this.coreTelemetryService = coreTelemetryService;
        this.logger = logger;
    }

    sendExtensionActivationEvent(hrStart: [number, number]): void {
        this.debugLogTelemetryEvent({hrStart});
        this.coreTelemetryService.sendExtensionActivationEvent(hrStart);
    }

    sendCommandEvent(commandName: string, properties: Record<string, string>): void {
        this.debugLogTelemetryEvent({commandName, properties});
        this.coreTelemetryService.sendCommandEvent(commandName, undefined, properties);
    }

    sendException(name: string, errorMessage: string, properties?: Record<string, string>): void {
        const fullMessage: string = properties ?
            `${errorMessage}\nEvent Properties: ${JSON.stringify(properties)}` : errorMessage;
        this.debugLogTelemetryEvent({name, errorMessage, properties});
        this.coreTelemetryService.sendException(name, fullMessage);
    }

    private debugLogTelemetryEvent(eventData: object): void {
        this.logger.debug('Sending the following telemetry data to live telemetry service:\n' +
            JSON.stringify(eventData, null, 2));
    }
}

export class LogOnlyTelemetryService implements TelemetryService {
    private readonly logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    sendExtensionActivationEvent(hrStart: [number, number]): void {
        this.debugLogTelemetryEvent({hrStart});
    }

    sendCommandEvent(commandName: string, properties: Record<string, string>): void {
        this.debugLogTelemetryEvent({commandName, properties});
    }

    sendException(name: string, errorMessage: string, properties?: Record<string, string>): void {
        this.debugLogTelemetryEvent({name, errorMessage, properties});
    }

    private debugLogTelemetryEvent(eventData: object): void {
        this.logger.debug('Unable to send the following telemetry data since live telemetry service is unavailable:\n' +
            JSON.stringify(eventData, null, 2));
    }
}
