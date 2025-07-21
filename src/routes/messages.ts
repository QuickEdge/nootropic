import { Router } from 'express';
import { AnthropicRequest, OpenAIStreamResponse, AnthropicStreamResponse } from '../types';
import { TranslationService } from '../services/translation';
import { OpenAIService } from '../services/openai';
import { createError } from '../middleware/error-handler';
import { ConfigManager } from '../utils/config';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const request: AnthropicRequest = req.body;
    
    if (!request.messages || !Array.isArray(request.messages)) {
      throw createError('Messages is required and must be an array', 400, 'invalid_request_error');
    }

    if (!request.model) {
      throw createError('Model is required', 400, 'invalid_request_error');
    }

    if (!request.max_tokens) {
      const config = ConfigManager.getInstance();
      request.max_tokens = config.getConfig().defaults.max_tokens;
    }

    const config = ConfigManager.getInstance();
    const modelConfig = config.getModelConfigWithFallback(request.model);
    
    if (!modelConfig) {
      throw createError(`Model ${request.model} not found`, 400, 'invalid_request_error');
    }

    const openAIService = new OpenAIService(modelConfig);
    const openAIRequest = TranslationService.anthropicToOpenAI(request, modelConfig);

    if (request.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const stream = await openAIService.createChatCompletionStream(openAIRequest);
        
        stream.on('data', (chunk: Buffer) => {
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
                const anthropicChunk = translateStreamChunk(parsed, request.model);
                res.write(`data: ${JSON.stringify(anthropicChunk)}\n\n`);
              } catch (error) {
                console.error('Error parsing stream chunk:', error);
              }
            }
          }
        });

        stream.on('end', () => {
          res.write('data: [DONE]\n\n');
          res.end();
        });

        stream.on('error', (error: Error) => {
          console.error('Stream error:', error);
          res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
          res.end();
        });

      } catch (error) {
        next(error);
      }
    } else {
      const openAIResponse = await openAIService.createChatCompletion(openAIRequest);
      const anthropicResponse = TranslationService.openAIToAnthropic(openAIResponse, request.model);
      
      res.json(anthropicResponse);
    }

  } catch (error) {
    next(error);
  }
});

function translateStreamChunk(openAIChunk: OpenAIStreamResponse, originalModel: string): AnthropicStreamResponse {
  const baseResponse: AnthropicStreamResponse = {
    type: 'content_block_delta',
    index: 0,
    delta: {
      text: '',
    },
  };

  if (openAIChunk.object === 'chat.completion.chunk') {
    const choice = openAIChunk.choices?.[0];
    const delta = choice?.delta;

    if (delta?.role) {
      return {
        type: 'message_start',
        message: {
          id: openAIChunk.id,
          type: 'message',
          role: 'assistant',
          content: [],
          model: originalModel,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
          },
        },
      };
    }

    if (delta?.content) {
      return {
        type: 'content_block_delta',
        index: 0,
        delta: {
          text: delta.content,
        },
      };
    }

    if (choice?.finish_reason) {
      return {
        type: 'message_delta',
        delta: {
          stop_reason: translateFinishReason(choice.finish_reason),
        },
      };
    }
  }

  return baseResponse;
}

function translateFinishReason(reason: string): string {
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'length':
      return 'max_tokens';
    case 'tool_calls':
      return 'tool_use';
    default:
      return 'end_turn';
  }
}

export { router as messagesRouter };