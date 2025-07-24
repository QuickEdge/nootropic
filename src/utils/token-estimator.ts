/**
 * Simple token estimation utilities for early usage reporting
 * Uses a rough approximation of text.length / 4 = tokens
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * Estimate token count from text using simple length-based approximation
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens from Anthropic messages
 */
export function estimateMessagesTokens(messages: Anthropic.Messages.MessageParam[]): number {
  let totalTokens = 0;
  
  for (const message of messages) {
    // Add role tokens (roughly 4 tokens per message for formatting)
    totalTokens += 4;
    
    if (typeof message.content === 'string') {
      totalTokens += estimateTokens(message.content);
    } else if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type === 'text') {
          totalTokens += estimateTokens(block.text || '');
        } else if (block.type === 'image') {
          // Rough estimate for image tokens
          totalTokens += 200;
        } else if (block.type === 'tool_use') {
          // Tool use block tokens
          totalTokens += estimateTokens(block.name || '');
          totalTokens += estimateTokens(JSON.stringify(block.input || {}));
        } else if (block.type === 'tool_result') {
          // Tool result tokens
          const content = typeof block.content === 'string' 
            ? block.content 
            : JSON.stringify(block.content);
          totalTokens += estimateTokens(content);
        }
      }
    }
  }
  
  return totalTokens;
}

/**
 * Estimate tokens for system prompt
 */
export function estimateSystemTokens(system: string | Anthropic.Messages.TextBlockParam[]): number {
  if (typeof system === 'string') {
    return estimateTokens(system);
  }
  
  let tokens = 0;
  for (const block of system) {
    if (block.type === 'text') {
      tokens += estimateTokens(block.text || '');
    }
  }
  
  return tokens;
}