import {TelemetryService} from "../../lib/external-services/telemetry-service";

export class SpyTelemetryService implements TelemetryService {
    sendExtensionActivationEventCallHistory: {hrStart: [number, number]}[] = [];
    sendExtensionActivationEvent(hrStart: [number, number]): void {
        this.sendExtensionActivationEventCallHistory.push({hrStart});
    }

    sendCommandEventCallHistory: {commandName: string, properties: Record<string, string>}[] = [];
    sendCommandEvent(commandName: string, properties: Record<string, string>): void {
        this.sendCommandEventCallHistory.push({commandName, properties});
    }

    sendExceptionCallHistory: {name: string, errorMessage: string, properties?: Record<string, string>}[] = [];
    sendException(name: string, errorMessage: string, properties?: Record<string, string>): void {
        this.sendExceptionCallHistory.push({name, errorMessage, properties});
    }
}
