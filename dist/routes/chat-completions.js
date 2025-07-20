"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatCompletionsRouter = void 0;
const express_1 = require("express");
const translation_1 = require("../services/translation");
const anthropic_1 = require("../services/anthropic");
const error_handler_1 = require("../middleware/error-handler");
const router = (0, express_1.Router)();
exports.chatCompletionsRouter = router;
router.post('/', async (req, res, next) => {
    try {
        const request = req.body;
        if (!request.messages || !Array.isArray(request.messages)) {
            throw (0, error_handler_1.createError)('Messages is required and must be an array', 400, 'invalid_request_error');
        }
        if (!request.model) {
            throw (0, error_handler_1.createError)('Model is required', 400, 'invalid_request_error');
        }
        const anthropicService = new anthropic_1.AnthropicService();
        const anthropicRequest = translation_1.TranslationService.openAIToAnthropic(request);
        if (request.stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            try {
                const stream = await anthropicService.createMessageStream(anthropicRequest);
                stream.on('data', (chunk) => {
                    const lines = chunk.toString().split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') {
                                res.write(`data: ${data}\n\n`);
                                continue;
                            }
                            try {
                                const parsed = JSON.parse(data);
                                const openAIChunk = translateStreamChunk(parsed, request.model);
                                res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);
                            }
                            catch (error) {
                                console.error('Error parsing stream chunk:', error);
                            }
                        }
                    }
                });
                stream.on('end', () => {
                    res.write('data: [DONE]\n\n');
                    res.end();
                });
                stream.on('error', (error) => {
                    console.error('Stream error:', error);
                    res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
                    res.end();
                });
            }
            catch (error) {
                next(error);
            }
        }
        else {
            const anthropicResponse = await anthropicService.createMessage(anthropicRequest);
            const openAIResponse = translation_1.TranslationService.anthropicToOpenAI(anthropicResponse, request.model);
            res.json(openAIResponse);
        }
    }
    catch (error) {
        next(error);
    }
});
function translateStreamChunk(anthropicChunk, originalModel) {
    const baseResponse = {
        id: `chatcmpl-${generateId()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: originalModel,
    };
    if (anthropicChunk.type === 'message_start') {
        return {
            ...baseResponse,
            choices: [{
                    index: 0,
                    delta: { role: 'assistant' },
                    logprobs: null,
                    finish_reason: undefined,
                }],
        };
    }
    if (anthropicChunk.type === 'content_block_delta' && anthropicChunk.delta?.text) {
        return {
            ...baseResponse,
            choices: [{
                    index: 0,
                    delta: { content: anthropicChunk.delta.text },
                    logprobs: null,
                    finish_reason: undefined,
                }],
        };
    }
    if (anthropicChunk.type === 'message_delta' && anthropicChunk.delta?.stop_reason) {
        return {
            ...baseResponse,
            choices: [{
                    index: 0,
                    delta: {},
                    logprobs: null,
                    finish_reason: translateFinishReason(anthropicChunk.delta.stop_reason),
                }],
        };
    }
    return {
        ...baseResponse,
        choices: [{
                index: 0,
                delta: {},
                logprobs: null,
                finish_reason: undefined,
            }],
    };
}
function translateFinishReason(reason) {
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
function generateId() {
    return Array.from({ length: 29 }, () => Math.random().toString(36)[2]).join('');
}
//# sourceMappingURL=chat-completions.js.map