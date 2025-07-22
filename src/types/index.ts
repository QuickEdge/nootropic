// Import official Anthropic SDK types
import Anthropic from '@anthropic-ai/sdk';

// Re-export SDK types for our proxy
export type AnthropicRequest = Anthropic.Messages.MessageCreateParams;
export type AnthropicMessage = Anthropic.Messages.MessageParam;
export type AnthropicContent = Anthropic.Messages.ContentBlock;
export type AnthropicContentParam = Anthropic.Messages.ContentBlockParam;
export type AnthropicTool = Anthropic.Messages.Tool;
export type AnthropicResponse = Anthropic.Messages.Message;
export type AnthropicStreamResponse = Anthropic.Messages.MessageStreamEvent;

// Re-export specific event types for clarity
export type MessageStartEvent = Anthropic.Messages.MessageStartEvent;
export type ContentBlockStartEvent = Anthropic.Messages.ContentBlockStartEvent;
export type ContentBlockDeltaEvent = Anthropic.Messages.ContentBlockDeltaEvent;
export type ContentBlockStopEvent = Anthropic.Messages.ContentBlockStopEvent;
export type MessageDeltaEvent = Anthropic.Messages.MessageDeltaEvent;
export type MessageStopEvent = Anthropic.Messages.MessageStopEvent;

// Re-export tool choice type
export type AnthropicToolChoice = Anthropic.Messages.ToolChoice;