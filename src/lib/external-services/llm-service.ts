import {CallLLMOptions, LLMServiceInterface} from "@salesforce/vscode-service-provider";
import {Logger} from "../logger";
import {RandomUUIDGenerator, UUIDGenerator} from "../utils";

/**
 * To buffer ourselves from having to mock out the LLMServiceInterface, we instead create our own
 * LLMService interface with only the methods that we care to use with the signatures that are best for us.
 */
export interface LLMService {
    callLLM(prompt: string, guidedJsonSchema?: string): Promise<string>
}

export interface LLMServiceProvider {
    isLLMServiceAvailable(): Promise<boolean>
    getLLMService(): Promise<LLMService>
}


export class LiveLLMService implements LLMService {
    // Delegates to the "Agentforce Vibes" LLM service
    private readonly coreLLMService: LLMServiceInterface;
    private readonly logger: Logger;
    private uuidGenerator: UUIDGenerator = new RandomUUIDGenerator();

    constructor(coreLLMService: LLMServiceInterface, logger: Logger) {
        this.coreLLMService = coreLLMService;
        this.logger = logger;
    }

    // For testing purposes only
    _setUUIDGenerator(uuidGenerator: UUIDGenerator) {
        this.uuidGenerator = uuidGenerator;
    }

    async callLLM(promptText: string, guidedJsonSchema?: string): Promise<string> {
        const promptId: string = this.uuidGenerator.generateUUID();
        const options: CallLLMOptions | undefined = guidedJsonSchema ? {
            parameters: {
                guided_json: guidedJsonSchema
            }
        } : undefined;
        this.logger.trace('About to call the LLM with:\n' + JSON.stringify({promptText, promptId, options}, null, 2));
        return await this.coreLLMService.callLLM(promptText, promptId, undefined, options);
    }
}
