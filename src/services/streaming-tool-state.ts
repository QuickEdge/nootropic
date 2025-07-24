import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import Logger from '../utils/logger';
import { estimateTokens, estimateMessagesTokens, estimateSystemTokens } from '../utils/token-estimator';

/**
 * Represents a tool call that's being accumulated across streaming chunks
 */
interface AccumulatingToolCall {
  index: number;
  id?: string;
  name?: string;
  arguments: string;
  hasStartedStreaming: boolean;
  isComplete: boolean;
}

/**
 * Manages streaming tool call state to properly accumulate OpenAI tool call fragments
 * and emit correct Anthropic streaming events
 */
export class StreamingToolCallState {
  private toolCalls: Map<number, AccumulatingToolCall> = new Map();
  private hasEmittedMessageStart = false;
  private sessionId: string;
  private cumulativeUsage: { input_tokens: number; output_tokens: number } = {
    input_tokens: 0,
    output_tokens: 0
  };
  private requestModel: string = 'claude-3-5-sonnet-20241022'; // Default, should be set from request
  private accumulatedContent: string = '';
  private estimatedInputTokens: number = 0;
  private inputTokensReported: number = 0;
  private totalChunksSeen: number = 0;
  private hasEmittedContentBlockStart = false;
  private contentBlockIndex = 0;

  constructor(
    sessionId: string, 
    requestModel?: string,
    anthropicRequest?: Anthropic.Messages.MessageCreateParams
  ) {
    this.sessionId = sessionId;
    if (requestModel) {
      this.requestModel = requestModel;
    }
    
    // Estimate input tokens from the request
    if (anthropicRequest) {
      this.estimatedInputTokens = this.estimateRequestTokens(anthropicRequest);
      // Start with 0 input tokens - we'll gradually accumulate them
      this.cumulativeUsage.input_tokens = 0;
      this.inputTokensReported = 0;
      
      Logger.debug('Estimated input tokens for streaming', {
        estimated_tokens: this.estimatedInputTokens,
        messages_count: anthropicRequest.messages.length,
        has_system: !!anthropicRequest.system,
        will_accumulate_gradually: true,
        session: this.sessionId
      });
    }
  }
  
  /**
   * Estimate total input tokens from the Anthropic request
   */
  private estimateRequestTokens(request: Anthropic.Messages.MessageCreateParams): number {
    let tokens = 0;
    
    // System prompt tokens
    if (request.system) {
      tokens += estimateSystemTokens(request.system);
    }
    
    // Message tokens
    tokens += estimateMessagesTokens(request.messages);
    
    // Add some overhead for request formatting
    tokens += 10;
    
    return tokens;
  }

  /**
   * Gradually increment input tokens to simulate real-time token accumulation
   */
  private getIncrementalInputTokens(): number {
    // Gradually increase input tokens over the first few chunks
    const maxInputChunks = 5; // Spread input token reporting over first 5 chunks
    
    if (this.totalChunksSeen < maxInputChunks && this.estimatedInputTokens > 0) {
      // Calculate how many tokens to add this chunk
      const tokensPerChunk = Math.ceil(this.estimatedInputTokens / maxInputChunks);
      const targetTokens = Math.min(
        this.inputTokensReported + tokensPerChunk,
        this.estimatedInputTokens
      );
      
      this.inputTokensReported = targetTokens;
      this.cumulativeUsage.input_tokens = targetTokens;
      
      Logger.debug('Incrementally reporting input tokens', {
        chunk_number: this.totalChunksSeen + 1,
        tokens_this_chunk: targetTokens - (this.inputTokensReported - tokensPerChunk),
        total_reported: targetTokens,
        estimated_total: this.estimatedInputTokens,
        session: this.sessionId
      });
      
      return targetTokens;
    }
    
    // After initial chunks, keep input tokens constant
    return this.cumulativeUsage.input_tokens;
  }

  /**
   * Processes an OpenAI streaming chunk and returns appropriate Anthropic events
   */
  processChunk(chunk: OpenAI.Chat.Completions.ChatCompletionChunk): Anthropic.Messages.MessageStreamEvent[] {
    const events: Anthropic.Messages.MessageStreamEvent[] = [];
    const delta = chunk.choices?.[0]?.delta;
    
    // Increment chunk counter for input token accumulation
    this.totalChunksSeen++;
    
    Logger.debug('Processing OpenAI chunk', {
      chunk_id: chunk.id,
      chunk_number: this.totalChunksSeen,
      has_usage: !!chunk.usage,
      usage: chunk.usage,
      delta_keys: delta ? Object.keys(delta) : [],
      session: this.sessionId
    });

    // Handle message start if not already emitted
    if (!this.hasEmittedMessageStart && delta?.role) {
      events.push(this.createMessageStartEvent(chunk));
      this.hasEmittedMessageStart = true;
    }
    
    // Don't emit usage deltas for early chunks - Anthropic doesn't do this
    
    // Track content for token estimation and emit content blocks
    if (delta?.content) {
      // Emit content_block_start on first content
      if (!this.hasEmittedContentBlockStart) {
        events.push({
          type: 'content_block_start',
          index: this.contentBlockIndex,
          content_block: {
            type: 'text',
            text: ''
          }
        } as Anthropic.Messages.ContentBlockStartEvent);
        this.hasEmittedContentBlockStart = true;
      }
      
      // Emit content_block_delta
      events.push({
        type: 'content_block_delta',
        index: this.contentBlockIndex,
        delta: {
          type: 'text_delta',
          text: delta.content
        }
      } as Anthropic.Messages.ContentBlockDeltaEvent);
      
      this.accumulatedContent += delta.content;
      
      // Update estimated output tokens
      const estimatedOutputTokens = estimateTokens(this.accumulatedContent);
      this.cumulativeUsage.output_tokens = estimatedOutputTokens;
      
      Logger.debug('Accumulated content for token estimation', {
        content_length: this.accumulatedContent.length,
        estimated_output_tokens: estimatedOutputTokens,
        session: this.sessionId
      });
    }

    // Process tool calls in the delta
    if (delta?.tool_calls) {
      for (const toolCallDelta of delta.tool_calls) {
        const toolEvents = this.processToolCallDelta(toolCallDelta, chunk.id);
        events.push(...toolEvents);
      }
    }

    // Handle completion
    const finishReason = chunk.choices?.[0]?.finish_reason;
    if (finishReason) {
      const completionEvents = this.handleCompletion(finishReason);
      events.push(...completionEvents);
    }

    // Handle actual usage information from OpenAI (overrides estimates)
    if (chunk.usage) {
      const previousInput = this.cumulativeUsage.input_tokens;
      const previousOutput = this.cumulativeUsage.output_tokens;
      
      this.cumulativeUsage.input_tokens = chunk.usage.prompt_tokens || this.estimatedInputTokens;
      this.cumulativeUsage.output_tokens = chunk.usage.completion_tokens || 0;
      
      Logger.debug('Updated cumulative usage from OpenAI chunk', { 
        openai_usage: chunk.usage,
        previous_usage: { input_tokens: previousInput, output_tokens: previousOutput },
        accumulated_usage: this.cumulativeUsage,
        estimated_vs_actual: {
          input_diff: this.cumulativeUsage.input_tokens - this.estimatedInputTokens,
          output_diff: this.cumulativeUsage.output_tokens - estimateTokens(this.accumulatedContent)
        },
        session: this.sessionId 
      });
    }

    return events;
  }

  /**
   * Processes a tool call delta and returns appropriate events
   */
  private processToolCallDelta(toolCallDelta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall, chunkId: string): Anthropic.Messages.MessageStreamEvent[] {
    const events: Anthropic.Messages.MessageStreamEvent[] = [];
    const index = toolCallDelta.index || 0;

    // Get or create accumulating tool call
    let toolCall = this.toolCalls.get(index);
    if (!toolCall) {
      toolCall = {
        index,
        arguments: '',
        hasStartedStreaming: false,
        isComplete: false
      };
      this.toolCalls.set(index, toolCall);
    }

    // Update tool call properties
    if (toolCallDelta.id) {
      toolCall.id = toolCallDelta.id;
    }
    if (toolCallDelta.function?.name) {
      toolCall.name = toolCallDelta.function.name;
    }
    if (toolCallDelta.function?.arguments) {
      toolCall.arguments += toolCallDelta.function.arguments;
    }

    // Emit content_block_start if we have enough info and haven't started streaming
    if (!toolCall.hasStartedStreaming && toolCall.name && toolCall.id) {
      Logger.debug('Starting tool call stream', { name: toolCall.name, index });
      
      // Generate a consistent Anthropic-style ID that can be mapped back
      const anthropicToolId = `toolu_stream_${chunkId}_${index}`;
      
      // Create mapping between the OpenAI ID and our generated Anthropic ID
      // Note: We reverse the normal mapping here since OpenAI created the ID first
      Logger.debug('Mapping streaming tool IDs', { openai_id: toolCall.id, anthropic_id: anthropicToolId });
      
      events.push({
        type: 'content_block_start',
        index: index + (this.hasEmittedContentBlockStart ? 1 : 0), // Adjust index if text block exists
        content_block: {
          type: 'tool_use',
          id: anthropicToolId,
          name: toolCall.name,
          input: {}
        }
      } as Anthropic.Messages.ContentBlockStartEvent);

      toolCall.hasStartedStreaming = true;
    }

    // Emit input_json_delta if we're streaming and have new arguments
    if (toolCall.hasStartedStreaming && toolCallDelta.function?.arguments) {
      Logger.debug('Tool call argument delta', { name: toolCall.name, arguments: toolCallDelta.function.arguments });
      
      events.push({
        type: 'content_block_delta',
        index: index + (this.hasEmittedContentBlockStart ? 1 : 0), // Adjust index if text block exists
        delta: {
          type: 'input_json_delta',
          partial_json: toolCallDelta.function.arguments
        }
      } as Anthropic.Messages.ContentBlockDeltaEvent);
      
      // Also track tool arguments for token estimation
      this.accumulatedContent += toolCallDelta.function.arguments;
      const estimatedOutputTokens = estimateTokens(this.accumulatedContent);
      this.cumulativeUsage.output_tokens = estimatedOutputTokens;
      
      // Don't emit usage updates for tool calls - Anthropic doesn't do this
    }

    return events;
  }

  /**
   * Handles stream completion and emits final events
   */
  private handleCompletion(finishReason?: string): Anthropic.Messages.MessageStreamEvent[] {
    const events: Anthropic.Messages.MessageStreamEvent[] = [];
    
    // Close text content block if it was opened
    if (this.hasEmittedContentBlockStart) {
      events.push({
        type: 'content_block_stop',
        index: this.contentBlockIndex
      } as Anthropic.Messages.ContentBlockStopEvent);
    }

    // Complete any active tool calls
    for (const [index, toolCall] of this.toolCalls) {
      if (toolCall.hasStartedStreaming && !toolCall.isComplete) {
        Logger.debug('Completing tool call', { name: toolCall.name, index, final_arguments: toolCall.arguments });
        
        events.push({
          type: 'content_block_stop',
          index: index + (this.hasEmittedContentBlockStart ? 1 : 0) // Adjust index if text block exists
        } as Anthropic.Messages.ContentBlockStopEvent);

        toolCall.isComplete = true;
      }
    }

    // Emit final message_delta with stop_reason and complete usage for claude-code
    const stopReason = finishReason ? this.translateFinishReason(finishReason) : 'end_turn';
    
    Logger.debug('Sending final streaming event with stop_reason and usage', {
      finish_reason: finishReason,
      translated_stop_reason: stopReason,
      final_usage: this.cumulativeUsage,
      session: this.sessionId
    });
    
    events.push({
      type: 'message_delta',
      delta: {
        stop_reason: stopReason,
        stop_sequence: null
      },
      usage: {
        input_tokens: this.cumulativeUsage.input_tokens,
        output_tokens: this.cumulativeUsage.output_tokens,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        server_tool_use: null,
        service_tier: 'standard' as Anthropic.Messages.Usage['service_tier']
      }
    } as Anthropic.Messages.MessageDeltaEvent);

    // Emit message_stop after the final delta
    events.push({
      type: 'message_stop'
    } as Anthropic.Messages.MessageStopEvent);

    return events;
  }

  /**
   * Creates a message start event
   */
  private createMessageStartEvent(chunk: OpenAI.Chat.Completions.ChatCompletionChunk): Anthropic.Messages.MessageStartEvent {
    return {
      type: 'message_start',
      message: {
        id: chunk.id,
        type: 'message',
        role: 'assistant',
        content: [],
        model: this.requestModel,
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
          server_tool_use: null,
          service_tier: 'standard' as Anthropic.Messages.Usage['service_tier']
        }
      }
    };
  }

  /**
   * Translates OpenAI finish reason to Anthropic stop reason
   */
  private translateFinishReason(reason: string): Anthropic.Messages.Message['stop_reason'] {
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

  /**
   * Gets statistics about current tool call state
   */
  getStats(): { 
    activeCalls: number; 
    completedCalls: number; 
    toolNames: string[];
    hasEmittedStart: boolean;
    usage: { input_tokens: number; output_tokens: number };
  } {
    const activeCalls = Array.from(this.toolCalls.values()).filter(tc => tc.hasStartedStreaming && !tc.isComplete).length;
    const completedCalls = Array.from(this.toolCalls.values()).filter(tc => tc.isComplete).length;
    const toolNames = Array.from(this.toolCalls.values()).map(tc => tc.name || 'unnamed').filter(Boolean);
    
    return {
      activeCalls,
      completedCalls,
      toolNames,
      hasEmittedStart: this.hasEmittedMessageStart,
      usage: { ...this.cumulativeUsage }
    };
  }

  /**
   * Clears the state for a new conversation
   */
  clear(): void {
    this.toolCalls.clear();
    this.hasEmittedMessageStart = false;
    this.cumulativeUsage = { input_tokens: 0, output_tokens: 0 };
    this.accumulatedContent = '';
    this.inputTokensReported = 0;
    this.totalChunksSeen = 0;
    this.hasEmittedContentBlockStart = false;
    this.contentBlockIndex = 0;
    Logger.debug('Cleared streaming tool call state', { sessionId: this.sessionId });
  }

  /**
   * Gets the accumulated arguments for a tool call (for debugging)
   */
  getAccumulatedArguments(index: number): string | undefined {
    return this.toolCalls.get(index)?.arguments;
  }
}