"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranslationService = void 0;
class TranslationService {
    static openAIToAnthropic(request) {
        const { messages } = request;
        const systemMessages = messages.filter(msg => msg.role === 'system');
        const conversationMessages = messages.filter(msg => msg.role !== 'system');
        const systemPrompt = systemMessages.length > 0
            ? systemMessages.map(msg => typeof msg.content === 'string' ? msg.content :
                Array.isArray(msg.content) ? msg.content.map(c => c.type === 'text' ? c.text : '').join('') : '').join('\n')
            : undefined;
        const anthropicMessages = conversationMessages.map(msg => this.translateOpenAIMessage(msg));
        return {
            model: this.translateModel(request.model),
            max_tokens: request.max_tokens || 4096,
            messages: anthropicMessages,
            system: systemPrompt,
            temperature: request.temperature,
            top_p: request.top_p,
            stream: request.stream,
            tools: request.tools ? this.translateTools(request.tools) : undefined,
            tool_choice: request.tool_choice ? this.translateToolChoice(request.tool_choice) : undefined,
            stop_sequences: Array.isArray(request.stop) ? request.stop : request.stop ? [request.stop] : undefined,
        };
    }
    static translateOpenAIMessage(message) {
        const role = message.role === 'assistant' ? 'assistant' : 'user';
        if (typeof message.content === 'string') {
            return {
                role,
                content: message.content,
            };
        }
        const content = message.content.map(item => {
            if (item.type === 'text') {
                return {
                    type: 'text',
                    text: item.text || '',
                };
            }
            else if (item.type === 'image_url') {
                const imageUrl = item.image_url?.url || '';
                const isBase64 = imageUrl.startsWith('data:');
                if (isBase64) {
                    const [header, data] = imageUrl.split(',');
                    const mediaType = header.split(';')[0].split(':')[1];
                    return {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: mediaType,
                            data: data || '',
                        },
                    };
                }
            }
            return {
                type: 'text',
                text: '',
            };
        });
        return {
            role,
            content,
        };
    }
    static translateTools(tools) {
        return tools.map(tool => ({
            name: tool.function.name,
            description: tool.function.description,
            input_schema: tool.function.parameters,
        }));
    }
    static translateToolChoice(toolChoice) {
        if (toolChoice === 'none') {
            return { type: 'auto' };
        }
        if (toolChoice === 'auto') {
            return { type: 'auto' };
        }
        if (typeof toolChoice === 'object' && toolChoice.type === 'function') {
            return {
                type: 'tool',
                name: toolChoice.function.name,
            };
        }
        return { type: 'auto' };
    }
    static translateModel(model) {
        const modelMap = {
            'gpt-4': 'claude-3-opus-20240229',
            'gpt-4-turbo': 'claude-3-sonnet-20240229',
            'gpt-3.5-turbo': 'claude-3-haiku-20240307',
            'gpt-4-turbo-preview': 'claude-3-sonnet-20240229',
            'gpt-4o': 'claude-3-5-sonnet-20241022',
            'gpt-4o-mini': 'claude-3-haiku-20240307',
        };
        return modelMap[model] || 'claude-3-sonnet-20240229';
    }
    static anthropicToOpenAI(response, originalModel) {
        const content = response.content
            .filter(c => c.type === 'text')
            .map(c => c.text || '')
            .join('');
        const toolCalls = response.content
            .filter(c => c.type === 'tool_use')
            .map(c => ({
            id: c.id || '',
            type: 'function',
            function: {
                name: c.name || '',
                arguments: JSON.stringify(c.input || {}),
            },
        }));
        const message = {
            role: 'assistant',
            content,
            ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
        };
        const finishReason = this.translateFinishReason(response.stop_reason);
        return {
            id: response.id,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: originalModel,
            choices: [{
                    index: 0,
                    message,
                    finish_reason: finishReason,
                }],
            usage: {
                prompt_tokens: response.usage.input_tokens,
                completion_tokens: response.usage.output_tokens,
                total_tokens: response.usage.input_tokens + response.usage.output_tokens,
            },
        };
    }
    static translateFinishReason(reason) {
        switch (reason) {
            case 'end_turn':
                return 'stop';
            case 'max_tokens':
                return 'length';
            case 'tool_use':
                return 'tool_calls';
            default:
                return 'stop';
        }
    }
}
exports.TranslationService = TranslationService;
//# sourceMappingURL=translation.js.map