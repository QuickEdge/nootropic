import { Router } from 'express';
import { AnthropicRequest, OpenAIStreamResponse, AnthropicStreamResponse } from '../types';
import { TranslationService } from '../services/translation';
import { OpenAIService } from '../services/openai';
import { createError } from '../middleware/error-handler';
import { validateAnthropicRequest } from '../middleware/request-validation';
import { ConfigManager } from '../utils/config';
import { ConversationLogger } from '../services/conversation-logger';
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
        const stream = await openAIService.createChatCompletionStream(openAIRequest);
        let streamBuffer = '';
        let buffer = '';
        
        stream.on('data', (chunk: Buffer) => {
          const chunkStr = chunk.toString();
          streamBuffer += chunkStr;  // For logging
          buffer += chunkStr;        // For parsing
          
          // Split on newlines and keep incomplete line in buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';  // Keep incomplete line
          
          // Process only complete lines
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              if (data === '[DONE]') {
                res.write(`data: ${data}\n\n`);
                continue;
              }
              
              if (data.trim()) {
                try {
                  const parsed = JSON.parse(data);
                  const anthropicChunk = translateStreamChunk(parsed, request.model);
                  res.write(`data: ${JSON.stringify(anthropicChunk)}\n\n`);
                } catch (error) {
                  console.error('Error parsing complete line:', error);
                  console.error('Line was:', line);
                }
              }
            }
          }
        });

        stream.on('end', () => {
          // Process complete buffer for logging
          try {
            const lines = streamBuffer.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ') && line.slice(6) !== '[DONE]') {
                try {
                  const parsed = JSON.parse(line.slice(6));
                  const anthropicChunk = translateStreamChunk(parsed, request.model);
                  logger.addStreamChunk(sessionId, anthropicChunk);
                } catch (error) {
                  // Individual line parse error - continue processing other lines
                }
              }
            }
          } catch (error) {
            console.error('Error processing stream buffer for logging:', error);
          }
          
          // Finish logging session
          console.log(`Finishing streaming session ${sessionId} with ${streamBuffer.length} bytes buffered`);
          logger.finishStreamingSession(sessionId).catch(error => {
            console.error('Error finishing streaming session log:', error);
          });
          
          res.write('data: [DONE]\n\n');
          res.end();
        });

        stream.on('error', (error: Error) => {
          console.error('Stream error:', error);
          
          // Clean up logging session on error
          logger.cleanupStreamingSession(sessionId);
          
          res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
          res.end();
        });

      } catch (error) {
        // Clean up logging session on error
        logger.cleanupStreamingSession(sessionId);
        next(error);
      }
    } else {
      const startTime = Date.now();
      const openAIResponse = await openAIService.createChatCompletion(openAIRequest);
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