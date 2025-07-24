import { Router } from 'express';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicRequest } from '../types';
import { TranslationService } from '../services/translation';
import { OpenAIService } from '../services/openai';
import { createError } from '../middleware/error-handler';
import { validateAnthropicRequest } from '../middleware/request-validation';
import { ConfigManager } from '../utils/config';
import { StreamingToolCallState } from '../services/streaming-tool-state';
import Logger from '../utils/logger';

const router = Router();

router.post('/', validateAnthropicRequest, async (req, res, next) => {
  try {
    const request: AnthropicRequest = req.body;
    
    const config = ConfigManager.getInstance();
    const modelConfig = config.getModelConfigWithFallback(request.model);
    
    if (!modelConfig) {
      throw createError(`Model ${request.model} not found`, 400, 'invalid_request_error');
    }

    // Apply max_tokens logic with model override support
    if (!request.max_tokens) {
      // No max_tokens in request, use model override or global default
      request.max_tokens = modelConfig.config.max_tokens || config.getConfig().defaults.max_tokens;
    } else if (modelConfig.config.max_tokens && request.max_tokens > modelConfig.config.max_tokens) {
      // Request max_tokens exceeds model limit, clamp to model limit
      Logger.warn('Request max_tokens exceeds model limit, clamping', {
        requested: request.max_tokens,
        model_limit: modelConfig.config.max_tokens,
        model: request.model
      });
      request.max_tokens = modelConfig.config.max_tokens;
    }

    const openAIService = new OpenAIService(modelConfig);
    const openAIRequest = TranslationService.anthropicToOpenAI(request, modelConfig);

    if (request.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');


      try {
        const streamRequest = openAIRequest as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
        const stream = await openAIService.createChatCompletionStream(streamRequest);
          
        // Create streaming tool call state manager for this session
        const toolCallState = new StreamingToolCallState('stream', request.model, request);
        
        for await (const chunk of stream) {
          try {
            // Use new stateful streaming translation
            const anthropicEvents = toolCallState.processChunk(chunk);
            
            // Send each event
            for (const anthropicChunk of anthropicEvents) {
              if (anthropicChunk.type === 'message_delta' && anthropicChunk.usage) {
                Logger.debug('Streaming usage event sent to claude-code', { 
                  usage: anthropicChunk.usage,
                  event_type: anthropicChunk.type,
                  event_structure: {
                    type: anthropicChunk.type,
                    delta: anthropicChunk.delta,
                    usage: anthropicChunk.usage
                  }
                });
              }
              
              // Log all streaming events for debugging
              Logger.debug('Streaming event sent', {
                event_type: anthropicChunk.type,
                has_usage: !!(anthropicChunk as Anthropic.Messages.MessageDeltaEvent).usage,
                event_data: anthropicChunk
              });
              
              // Write in SSE format with event type
              if (anthropicChunk.type) {
                res.write(`event: ${anthropicChunk.type}\n`);
              }
              res.write(`data: ${JSON.stringify(anthropicChunk)}\n\n`);
            }
          } catch (error) {
            Logger.error('Error translating stream chunk', { error, chunk });
          }
        }

        
        // Don't send [DONE] - Anthropic doesn't use it
        res.end();

      } catch (error) {
        
        if (error instanceof OpenAI.APIError) {
          Logger.error('OpenAI API Stream Error', { message: error.message, status: error.status });
          res.write(`event: error\n`);
          res.write(`data: ${JSON.stringify({ error: `OpenAI API error: ${error.message}` })}\n\n`);
        } else {
          Logger.error('Stream error', { error });
          res.write(`event: error\n`);
          res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
        }
        res.end();
      }
    } else {
      const nonStreamRequest = openAIRequest as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
      const openAIResponse = await openAIService.createChatCompletion(nonStreamRequest);
      
      const anthropicResponse = TranslationService.openAIToAnthropic(openAIResponse, request.model);
      
      Logger.debug('Non-streaming response sent to claude-code', { 
        usage: anthropicResponse.usage,
        response_id: anthropicResponse.id,
        response_structure: {
          id: anthropicResponse.id,
          type: anthropicResponse.type,
          role: anthropicResponse.role,
          model: anthropicResponse.model,
          stop_reason: anthropicResponse.stop_reason,
          usage_complete: anthropicResponse.usage
        }
      });
      
      res.json(anthropicResponse);
    }

  } catch (error) {
    next(error);
  }
});



export { router as messagesRouter };