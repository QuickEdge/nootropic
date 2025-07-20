import { AnthropicRequest, AnthropicResponse } from '../types';
export declare class AnthropicService {
    private client;
    constructor(apiKey?: string);
    createMessage(request: AnthropicRequest): Promise<AnthropicResponse>;
    createMessageStream(request: AnthropicRequest): Promise<any>;
}
//# sourceMappingURL=anthropic.d.ts.map