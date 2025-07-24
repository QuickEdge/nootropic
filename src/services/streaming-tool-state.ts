import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import Logger from '../utils/logger';

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
  private actualUsage: { input_tokens: number; output_tokens: number } | null = null;
  private requestModel: string = 'claude-3-5-sonnet-20241022'; // Default, should be set from request
  private estimatedInputTokens: number = 0;
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
    
    // Simple input token estimation for message_start
    if (anthropicRequest) {
      // Rough estimate: count all text content and divide by 4
      let totalLength = 0;
      
      // System prompt
      if (anthropicRequest.system) {
        totalLength += anthropicRequest.system.length;
      }
      
      // Messages
      for (const msg of anthropicRequest.messages) {
        if (typeof msg.content === 'string') {
          totalLength += msg.content.length;
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              totalLength += block.text.length;
            }
          }
        }
      }
      
      // Simple estimation: ~4 characters per token
      this.estimatedInputTokens = Math.ceil(totalLength / 4);
      
      Logger.debug('Simple input token estimation', {
        total_text_length: totalLength,
        estimated_tokens: this.estimatedInputTokens,
        messages_count: anthropicRequest.messages.length,
        has_system: !!anthropicRequest.system,
        session: this.sessionId
      });
    }
  }

  /**
   * Processes an OpenAI streaming chunk and returns appropriate Anthropic events
   */
  processChunk(chunk: OpenAI.Chat.Completions.ChatCompletionChunk): Anthropic.Messages.MessageStreamEvent[] {
    const events: Anthropic.Messages.MessageStreamEvent[] = [];
    const delta = chunk.choices?.[0]?.delta;
    
    Logger.debug('Processing OpenAI chunk', {
      chunk_id: chunk.id,
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

    // Store actual usage information from OpenAI
    if (chunk.usage) {
      this.actualUsage = {
        input_tokens: chunk.usage.prompt_tokens || 0,
        output_tokens: chunk.usage.completion_tokens || 0
      };
      
      Logger.debug('Received actual usage from OpenAI', { 
        openai_usage: chunk.usage,
        actual_usage: this.actualUsage,
        estimated_input: this.estimatedInputTokens,
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
    
    // Use actual usage from OpenAI if available, otherwise use estimates
    const finalUsage = this.actualUsage || {
      input_tokens: this.estimatedInputTokens,
      output_tokens: 0  // We don't estimate output tokens
    };
    
    Logger.debug('Sending final streaming event with stop_reason and usage', {
      finish_reason: finishReason,
      translated_stop_reason: stopReason,
      final_usage: finalUsage,
      has_actual_usage: !!this.actualUsage,
      session: this.sessionId
    });
    
    events.push({
      type: 'message_delta',
      delta: {
        stop_reason: stopReason,
        stop_sequence: null
      },
      usage: {
        input_tokens: finalUsage.input_tokens,
        output_tokens: finalUsage.output_tokens,
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
          input_tokens: this.estimatedInputTokens,
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
    usage: { input_tokens: number; output_tokens: number } | null;
  } {
    const activeCalls = Array.from(this.toolCalls.values()).filter(tc => tc.hasStartedStreaming && !tc.isComplete).length;
    const completedCalls = Array.from(this.toolCalls.values()).filter(tc => tc.isComplete).length;
    const toolNames = Array.from(this.toolCalls.values()).map(tc => tc.name || 'unnamed').filter(Boolean);
    
    return {
      activeCalls,
      completedCalls,
      toolNames,
      hasEmittedStart: this.hasEmittedMessageStart,
      usage: this.actualUsage
    };
  }

  /**
   * Clears the state for a new conversation
   */
  clear(): void {
    this.toolCalls.clear();
    this.hasEmittedMessageStart = false;
    this.actualUsage = null;
    this.estimatedInputTokens = 0;
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