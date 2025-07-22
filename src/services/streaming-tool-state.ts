import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

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

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Processes an OpenAI streaming chunk and returns appropriate Anthropic events
   */
  processChunk(chunk: OpenAI.Chat.Completions.ChatCompletionChunk): Anthropic.Messages.MessageStreamEvent[] {
    const events: Anthropic.Messages.MessageStreamEvent[] = [];
    const delta = chunk.choices?.[0]?.delta;

    // Handle message start if not already emitted
    if (!this.hasEmittedMessageStart && delta?.role) {
      events.push(this.createMessageStartEvent(chunk));
      this.hasEmittedMessageStart = true;
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
      const completionEvents = this.handleCompletion();
      events.push(...completionEvents);
    }

    // Handle usage information
    if (chunk.usage) {
      events.push({
        type: 'message_delta',
        delta: {},
        usage: {
          input_tokens: chunk.usage.prompt_tokens || 0,
          output_tokens: chunk.usage.completion_tokens || 0
        }
      } as Anthropic.Messages.MessageDeltaEvent);
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
      console.log(`🚀 Starting tool call stream for: ${toolCall.name} (index: ${index})`);
      
      // Generate a consistent Anthropic-style ID that can be mapped back
      const anthropicToolId = `toolu_stream_${chunkId}_${index}`;
      
      // Create mapping between the OpenAI ID and our generated Anthropic ID
      // Note: We reverse the normal mapping here since OpenAI created the ID first
      console.log(`🔗 Mapping streaming tool IDs: OpenAI ${toolCall.id} → Anthropic ${anthropicToolId}`);
      
      events.push({
        type: 'content_block_start',
        index: index,
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
      console.log(`📝 Tool call argument delta for ${toolCall.name}: "${toolCallDelta.function.arguments}"`);
      
      events.push({
        type: 'content_block_delta',
        index: index,
        delta: {
          type: 'input_json_delta',
          partial_json: toolCallDelta.function.arguments
        }
      } as Anthropic.Messages.ContentBlockDeltaEvent);
    }

    return events;
  }

  /**
   * Handles stream completion and emits final events
   */
  private handleCompletion(): Anthropic.Messages.MessageStreamEvent[] {
    const events: Anthropic.Messages.MessageStreamEvent[] = [];

    // Complete any active tool calls
    for (const [index, toolCall] of this.toolCalls) {
      if (toolCall.hasStartedStreaming && !toolCall.isComplete) {
        console.log(`✅ Completing tool call: ${toolCall.name} (index: ${index})`);
        console.log(`📋 Final arguments: ${toolCall.arguments}`);
        
        events.push({
          type: 'content_block_stop',
          index: index
        } as Anthropic.Messages.ContentBlockStopEvent);

        toolCall.isComplete = true;
      }
    }

    // Emit message_stop
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
        model: 'claude-opus-4-20250514', // This should be configurable
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
  } {
    const activeCalls = Array.from(this.toolCalls.values()).filter(tc => tc.hasStartedStreaming && !tc.isComplete).length;
    const completedCalls = Array.from(this.toolCalls.values()).filter(tc => tc.isComplete).length;
    const toolNames = Array.from(this.toolCalls.values()).map(tc => tc.name || 'unnamed').filter(Boolean);
    
    return {
      activeCalls,
      completedCalls,
      toolNames,
      hasEmittedStart: this.hasEmittedMessageStart
    };
  }

  /**
   * Clears the state for a new conversation
   */
  clear(): void {
    this.toolCalls.clear();
    this.hasEmittedMessageStart = false;
    console.log(`🧹 Cleared streaming tool call state for session ${this.sessionId}`);
  }

  /**
   * Gets the accumulated arguments for a tool call (for debugging)
   */
  getAccumulatedArguments(index: number): string | undefined {
    return this.toolCalls.get(index)?.arguments;
  }
}