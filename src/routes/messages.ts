import { Router } from 'express';
import OpenAI from 'openai';
import { AnthropicRequest, AnthropicStreamResponse, AnthropicResponse } from '../types';
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
        const streamRequest = openAIRequest as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
        const stream = await openAIService.createChatCompletionStream(streamRequest);
        
        for await (const chunk of stream) {
          try {
            const anthropicChunk = translateStreamChunk(chunk, request.model);
            
            // Add chunk to logger in real-time
            logger.addStreamChunk(sessionId, anthropicChunk);
            
            res.write(`data: ${JSON.stringify(anthropicChunk)}\n\n`);
          } catch (error) {
            console.error('Error translating stream chunk:', error);
            console.error('Chunk was:', chunk);
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
      // Convert Anthropic SDK message to our custom type for logging
      const logResponse = {
        ...anthropicResponse,
        stop_reason: anthropicResponse.stop_reason || 'end_turn',
        content: anthropicResponse.content.map(block => {
          if (block.type === 'text') {
            return { type: 'text' as const, text: block.text };
          } else if (block.type === 'tool_use') {
            return { 
              type: 'tool_use' as const, 
              id: block.id, 
              name: block.name, 
              input: block.input as Record<string, unknown>
            };
          }
          return { type: 'text' as const, text: '' };
        })
      } as AnthropicResponse;
      await logger.logConversation(request, logResponse, {
        requestId: anthropicResponse.id,
        durationMs: endTime - startTime
      });
      
      res.json(anthropicResponse);
    }

  } catch (error) {
    next(error);
  }
});

function translateStreamChunk(openAIChunk: OpenAI.Chat.Completions.ChatCompletionChunk, originalModel: string): AnthropicStreamResponse {
  // Log the raw OpenAI chunk for debugging
  console.log('🔄 Raw OpenAI chunk:', JSON.stringify(openAIChunk, null, 2));

  const baseResponse: AnthropicStreamResponse = {
    type: 'content_block_delta',
    index: 0,
    delta: {
      text: '',
    },
  };

  let translatedResponse = baseResponse;

  if (openAIChunk.object === 'chat.completion.chunk') {
    const choice = openAIChunk.choices?.[0];
    const delta = choice?.delta;

    // Handle usage information chunks (final chunks from OpenAI with usage data)
    if (openAIChunk.usage) {
      translatedResponse = {
        type: 'message_delta',
        delta: {
          usage: {
            input_tokens: openAIChunk.usage.prompt_tokens,
            output_tokens: openAIChunk.usage.completion_tokens,
          },
        },
      };
    } else if (delta?.role && !delta?.tool_calls) {
      // Only treat as message_start if there's a role but no tool calls
      translatedResponse = {
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
    } else if (delta?.tool_calls) {
      // Handle tool calls - translate to tool_use content block
      const toolCall = delta.tool_calls[0]; // OpenAI sends one tool call per chunk
      
      if (toolCall?.function?.name) {
        // This is a tool_use content block start with function name
        translatedResponse = {
          type: 'content_block_start',
          index: toolCall.index || 0,
          content_block: {
            type: 'tool_use',
            id: `tool_${openAIChunk.id}_${toolCall.index || 0}`,
            name: toolCall.function.name,
            input: {}
          }
        };
      } else if (toolCall?.function?.arguments) {
        // This is a delta with tool arguments (could be first chunk with just arguments)
        // If this is the first chunk and we have arguments but no name, treat as content_block_start
        const isFirstChunk = !toolCall.function.name && toolCall.function.arguments;
        
        if (isFirstChunk) {
          translatedResponse = {
            type: 'content_block_start',
            index: toolCall.index || 0,
            content_block: {
              type: 'tool_use',
              id: `tool_${openAIChunk.id}_${toolCall.index || 0}`,
              name: toolCall.function.arguments, // In some APIs, arguments might contain the tool name
              input: {}
            }
          };
        } else {
          translatedResponse = {
            type: 'content_block_delta',
            index: toolCall.index || 0,
            delta: {
              partial_json: toolCall.function.arguments
            }
          };
        }
      } else if (toolCall?.function) {
        // This is the start of a tool call but function name might come in a later chunk
        // Treat as content_block_start with placeholder
        translatedResponse = {
          type: 'content_block_start',
          index: toolCall.index || 0,
          content_block: {
            type: 'tool_use',
            id: `tool_${openAIChunk.id}_${toolCall.index || 0}`,
            name: 'pending', // Will be updated in subsequent chunks
            input: {}
          }
        };
      }
    } else if (delta?.content) {
      // Regular text content
      translatedResponse = {
        type: 'content_block_delta',
        index: 0,
        delta: {
          text: delta.content,
        },
      };
    } else if (choice?.finish_reason) {
      translatedResponse = {
        type: 'message_delta',
        delta: {
          stop_reason: translateFinishReason(choice.finish_reason),
        },
      };
    }
  }

  // Log the translated Anthropic chunk for debugging
  console.log('✅ Translated Anthropic chunk:', JSON.stringify(translatedResponse, null, 2));

  return translatedResponse;
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