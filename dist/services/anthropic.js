"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicService = void 0;
const axios_1 = __importDefault(require("axios"));
class AnthropicService {
    constructor(apiKey) {
        const key = apiKey || process.env.ANTHROPIC_API_KEY;
        if (!key) {
            throw new Error('ANTHROPIC_API_KEY is required');
        }
        this.client = axios_1.default.create({
            baseURL: 'https://api.anthropic.com',
            headers: {
                'x-api-key': key,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            timeout: 60000,
        });
    }
    async createMessage(request) {
        try {
            const response = await this.client.post('/v1/messages', request);
            return response.data;
        }
        catch (error) {
            if (error.response) {
                throw new Error(`Anthropic API error: ${error.response.data?.error?.message || error.response.statusText}`);
            }
            throw new Error(`Failed to connect to Anthropic API: ${error.message}`);
        }
    }
    async createMessageStream(request) {
        try {
            const response = await this.client.post('/v1/messages', {
                ...request,
                stream: true,
            }, {
                responseType: 'stream',
            });
            return response.data;
        }
        catch (error) {
            if (error.response) {
                throw new Error(`Anthropic API error: ${error.response.data?.error?.message || error.response.statusText}`);
            }
            throw new Error(`Failed to connect to Anthropic API: ${error.message}`);
        }
    }
}
exports.AnthropicService = AnthropicService;
//# sourceMappingURL=anthropic.js.map