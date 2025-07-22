import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { SimpleToolBatcher } from './simple-tool-batcher';

interface StreamEventBuffer {
  messageStartSent: boolean;
  bufferedUsage: {
    input_tokens: number;
    output_tokens: number;
  };
  streamCount: number;
}

/**
 * Handles sequential processing of multiple single-tool streams
 * to work around provider limitations while maintaining streaming transparency
 */
export class StreamingToolBatcher extends SimpleToolBatcher {
  private eventBuffer: StreamEventBuffer;

  constructor(limitToolResults: boolean) {
    super(limitToolResults);
    this.eventBuffer = {
      messageStartSent: false,
      bufferedUsage: { input_tokens: 0, output_tokens: 0 },
      streamCount: 0
    };
  }

  /**
   * Processes multiple single-tool streams sequentially and yields coordinated events
   */
  async* processSequentialStreams(
    client: OpenAI,
    request: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
  ): AsyncGenerator<Anthropic.Messages.MessageStreamEvent[]> {
    // Reset buffer for new stream sequence
    this.resetEventBuffer();

    const singleToolRequests = this.createSingleToolResultRequests(request);
    console.log(`🔄 Processing ${singleToolRequests.length} sequential streams for tool result batching`);

    for (let i = 0; i < singleToolRequests.length; i++) {
      const singleRequest = singleToolRequests[i];
      const isFirstStream = i === 0;
      const isLastStream = i === singleToolRequests.length - 1;

      try {
        const streamRequest = {
          ...singleRequest,
          stream: true
        } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;

        const stream = await client.chat.completions.create(streamRequest);
        
        yield* this.processIndividualStream(stream, isFirstStream, isLastStream, i + 1);
        
      } catch (error) {
        if (this.isListIndexError(error)) {
          console.error(`❌ List index error in stream batch ${i + 1} - this should not happen with single tool results:`, error);
          
          // Generate error event for the client
          yield [{
            type: 'error',
            error: {
              type: 'api_error',
              message: `Tool result batching failed: ${(error as Error).message}`
            }
          } as any]; // Using any since error events aren't in the official Anthropic types
          
          throw new Error(`Tool result batching failed on stream ${i + 1}: ${(error as Error).message}`);
        } else {
          console.error(`❌ Unexpected error in stream batch ${i + 1}:`, error);
          
          // Generate error event for the client
          yield [{
            type: 'error',
            error: {
              type: 'api_error', 
              message: `Stream processing failed: ${(error as Error).message}`
            }
          } as any];
          
          throw error;
        }
      }
    }

    // Send final aggregated usage and completion events
    yield this.generateFinalEvents();
  }

  /**
   * Processes an individual stream and yields appropriate events
   */
  private async* processIndividualStream(
    stream: any, // OpenAI stream type
    isFirstStream: boolean,
    isLastStream: boolean,
    batchNumber: number
  ): AsyncGenerator<Anthropic.Messages.MessageStreamEvent[]> {
    
    this.eventBuffer.streamCount++;
    console.log(`📡 Processing stream ${this.eventBuffer.streamCount}`);

    for await (const chunk of stream) {
      try {
        const events = this.processStreamChunk(chunk, isFirstStream, isLastStream);
        if (events.length > 0) {
          yield events;
        }
      } catch (error) {
        console.error(`❌ Error processing stream chunk in batch ${batchNumber}:`, error);
        console.error('Chunk was:', chunk);
        
        // Generate error event and continue processing
        yield [{
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: `Error processing chunk in stream batch ${batchNumber}: ${(error as Error).message}`
          }
        } as any];
      }
    }
  }

  /**
   * Processes a single stream chunk and returns appropriate events
   */
  private processStreamChunk(
    chunk: OpenAI.Chat.Completions.ChatCompletionChunk,
    isFirstStream: boolean,
    isLastStream: boolean
  ): Anthropic.Messages.MessageStreamEvent[] {
    const events: Anthropic.Messages.MessageStreamEvent[] = [];
    const choice = chunk.choices?.[0];
    const delta = choice?.delta;

    // Handle message_start (only for the very first stream)
    if (isFirstStream && delta?.role && !this.eventBuffer.messageStartSent) {
      events.push({
        type: 'message_start',
        message: {
          id: chunk.id,
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'batched-model', // Will be replaced with actual model in the service
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
            server_tool_use: null,
            service_tier: 'standard' as const
          },
        },
      } as Anthropic.Messages.MessageStartEvent);
      
      this.eventBuffer.messageStartSent = true;
    }

    // Handle content (text or tool calls) - pass through all content events
    if (delta?.content) {
      events.push({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: delta.content,
        },
      } as Anthropic.Messages.ContentBlockDeltaEvent);
    }

    if (delta?.tool_calls) {
      // For now, we'll pass through tool call events as-is
      // This maintains compatibility with existing streaming tool call handling
      for (const toolCall of delta.tool_calls) {
        if (toolCall?.function?.name) {
          events.push({
            type: 'content_block_start',
            index: toolCall.index || 0,
            content_block: {
              type: 'tool_use',
              id: `tool_${chunk.id}_${toolCall.index || 0}`,
              name: toolCall.function.name,
              input: {}
            }
          } as Anthropic.Messages.ContentBlockStartEvent);
        } else if (toolCall?.function?.arguments) {
          events.push({
            type: 'content_block_delta',
            index: toolCall.index || 0,
            delta: {
              type: 'input_json_delta',
              partial_json: toolCall.function.arguments
            }
          } as Anthropic.Messages.ContentBlockDeltaEvent);
        }
      }
    }

    // Buffer usage information (don't send it yet)
    if (chunk.usage) {
      this.eventBuffer.bufferedUsage.input_tokens += chunk.usage.prompt_tokens || 0;
      this.eventBuffer.bufferedUsage.output_tokens += chunk.usage.completion_tokens || 0;
    }

    // Handle completion - but don't send message_stop unless this is the last stream
    if (choice?.finish_reason !== undefined && choice.finish_reason !== null && !isLastStream) {
      // For non-final streams, we might want to send a content_block_stop
      // but not message_stop - that comes at the very end
      console.log(`⏸️ Stream ${this.eventBuffer.streamCount} completed (reason: ${choice.finish_reason})`);
    }

    return events;
  }

  /**
   * Generates final events after all streams are processed
   */
  private generateFinalEvents(): Anthropic.Messages.MessageStreamEvent[] {
    const events: Anthropic.Messages.MessageStreamEvent[] = [];

    // Send aggregated usage information
    if (this.eventBuffer.bufferedUsage.input_tokens > 0 || this.eventBuffer.bufferedUsage.output_tokens > 0) {
      events.push({
        type: 'message_delta',
        delta: {},
        usage: {
          input_tokens: this.eventBuffer.bufferedUsage.input_tokens,
          output_tokens: this.eventBuffer.bufferedUsage.output_tokens
        }
      } as Anthropic.Messages.MessageDeltaEvent);
    }

    // Send final message_stop
    events.push({
      type: 'message_stop'
    } as Anthropic.Messages.MessageStopEvent);

    console.log(`✅ Completed ${this.eventBuffer.streamCount} batched streams with aggregated usage:`, this.eventBuffer.bufferedUsage);

    return events;
  }

  /**
   * Resets the event buffer for a new stream sequence
   */
  private resetEventBuffer(): void {
    this.eventBuffer = {
      messageStartSent: false,
      bufferedUsage: { input_tokens: 0, output_tokens: 0 },
      streamCount: 0
    };
  }
}