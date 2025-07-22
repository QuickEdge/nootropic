import { Router } from 'express';
import OpenAI from 'openai';
import { AnthropicRequest } from '../types';
import { TranslationService } from '../services/translation';
import { OpenAIService } from '../services/openai';
import { createError } from '../middleware/error-handler';
import { validateAnthropicRequest } from '../middleware/request-validation';
import { ConfigManager } from '../utils/config';
import { StreamingToolCallState } from '../services/streaming-tool-state';

const router = Router();

router.post('/', validateAnthropicRequest, async (req, res, next) => {
  try {
    const request: AnthropicRequest = req.body;
    
    // Set default max_tokens if not provided (validation middleware ensures it's valid if present)
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
        const streamRequest = openAIRequest as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
        const stream = await openAIService.createChatCompletionStream(streamRequest);
          
        // Create streaming tool call state manager for this session
        const toolCallState = new StreamingToolCallState('stream');
        
        for await (const chunk of stream) {
          try {
            // Use new stateful streaming translation
            const anthropicEvents = toolCallState.processChunk(chunk);
            
            // Send each event
            for (const anthropicChunk of anthropicEvents) {
              res.write(`data: ${JSON.stringify(anthropicChunk)}\n\n`);
            }
          } catch (error) {
            console.error('Error translating stream chunk:', error);
            console.error('Chunk was:', chunk);
          }
        }

        
        res.write('data: [DONE]\n\n');
        res.end();

      } catch (error) {
        
        if (error instanceof OpenAI.APIError) {
          console.error('OpenAI API Stream Error:', error.message);
          res.write(`data: ${JSON.stringify({ error: `OpenAI API error: ${error.message}` })}\n\n`);
        } else {
          console.error('Stream error:', error);
          res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
        }
        res.end();
      }
    } else {
      const startTime = Date.now();
      const nonStreamRequest = openAIRequest as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
      const openAIResponse = await openAIService.createChatCompletion(nonStreamRequest);
      
      const anthropicResponse = TranslationService.openAIToAnthropic(openAIResponse, request.model);
      
      const endTime = Date.now();
      
      
      res.json(anthropicResponse);
    }

  } catch (error) {
    next(error);
  }
});



export { router as messagesRouter };