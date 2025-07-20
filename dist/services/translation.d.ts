import { OpenAIChatRequest, AnthropicRequest, AnthropicResponse, OpenAIChatResponse } from '../types';
export declare class TranslationService {
    static openAIToAnthropic(request: OpenAIChatRequest): AnthropicRequest;
    private static translateOpenAIMessage;
    private static translateTools;
    private static translateToolChoice;
    private static translateModel;
    static anthropicToOpenAI(response: AnthropicResponse, originalModel: string): OpenAIChatResponse;
    private static translateFinishReason;
}
//# sourceMappingURL=translation.d.ts.map