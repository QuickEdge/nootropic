import { Router } from 'express';
import OpenAI from 'openai';
import { AnthropicRequest } from '../types';
import { TranslationService } from '../services/translation';
import { OpenAIService } from '../services/openai';
import { createError } from '../middleware/error-handler';
import { validateAnthropicRequest } from '../middleware/request-validation';
import { ConfigManager } from '../utils/config';
import { ConversationLogger } from '../services/conversation-logger';
import { StreamingToolCallState } from '../services/streaming-tool-state';
import { randomBytes } from 'crypto';

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

      // Set up streaming session for logging
      const sessionId = randomBytes(16).toString('hex');
      const logger = ConversationLogger.getInstance();
      console.log(`Starting streaming session ${sessionId} for model ${request.model}`);
      logger.startStreamingSession(request, sessionId);

      try {
        const streamRequest = openAIRequest as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
        const streamResult = await openAIService.createChatCompletionStream(streamRequest);
        
        if (streamResult === 'BATCHED_STREAM') {
          // Handle batched streaming - events come pre-processed
          console.log('📡 Processing batched streaming request');
          
          for await (const eventBatch of openAIService.createBatchedStream(streamRequest)) {
            try {
              // Events are already in Anthropic format from the batcher
              for (const anthropicEvent of eventBatch) {
                // Handle error events (using any type casting for custom error events)
                if ((anthropicEvent as any).type === 'error') {
                  console.error('📡 Batched stream error event:', anthropicEvent);
                  res.write(`data: ${JSON.stringify({ error: (anthropicEvent as any).error })}\n\n`);
                  continue;
                }
                
                // Update model name in message_start events
                if (anthropicEvent.type === 'message_start') {
                  anthropicEvent.message.model = request.model;
                }
                
                // Add event to logger
                logger.addStreamChunk(sessionId, anthropicEvent);
                
                // Send to client
                res.write(`data: ${JSON.stringify(anthropicEvent)}\n\n`);
              }
            } catch (error) {
              console.error('Error processing batched stream events:', error);
              console.error('Event batch was:', eventBatch);
              // Send error to client but continue processing
              res.write(`data: ${JSON.stringify({ error: 'Stream processing error' })}\n\n`);
            }
          }
        } else {
          // Handle normal streaming - needs chunk translation
          const stream = streamResult;
          
          // Create streaming tool call state manager for this session
          const toolCallState = new StreamingToolCallState(sessionId);
          
          for await (const chunk of stream) {
            try {
              // Use new stateful streaming translation
              const anthropicEvents = toolCallState.processChunk(chunk);
              
              // Send each event
              for (const anthropicChunk of anthropicEvents) {
                // Add chunk to logger in real-time
                logger.addStreamChunk(sessionId, anthropicChunk);
                
                res.write(`data: ${JSON.stringify(anthropicChunk)}\n\n`);
              }
            } catch (error) {
              console.error('Error translating stream chunk:', error);
              console.error('Chunk was:', chunk);
            }
          }
        }

        // Finish logging session
        console.log(`Finishing streaming session ${sessionId}`);
        logger.finishStreamingSession(sessionId).catch(error => {
          console.error('Error finishing streaming session log:', error);
        });
        
        res.write('data: [DONE]\n\n');
        res.end();

      } catch (error) {
        // Clean up logging session on error
        logger.cleanupStreamingSession(sessionId);
        
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
      
      // Log conversation if enabled
      const logger = ConversationLogger.getInstance();
      await logger.logConversation(request, anthropicResponse, {
        requestId: anthropicResponse.id,
        durationMs: endTime - startTime
      });
      
      res.json(anthropicResponse);
    }

  } catch (error) {
    next(error);
  }
});



export { router as messagesRouter };