import OpenAI from 'openai';

/**
 * Simple tool result batcher - either unlimited or 1 per request
 */
export class SimpleToolBatcher {
  private shouldBatch: boolean;

  constructor(limitToolResults: boolean) {
    this.shouldBatch = limitToolResults;
  }

  /**
   * Checks if request needs batching based on tool result count
   */
  needsBatching(request: OpenAI.Chat.Completions.ChatCompletionCreateParams): boolean {
    if (!this.shouldBatch) {
      return false;
    }

    const toolResultCount = request.messages.filter(msg => msg.role === 'tool').length;
    return toolResultCount > 1;
  }

  /**
   * Splits request into individual tool result requests
   */
  createSingleToolResultRequests(
    request: OpenAI.Chat.Completions.ChatCompletionCreateParams
  ): OpenAI.Chat.Completions.ChatCompletionCreateParams[] {
    const toolResultIndices = this.findToolResultIndices(request);
    
    if (toolResultIndices.length <= 1) {
      return [request];
    }

    const requests: OpenAI.Chat.Completions.ChatCompletionCreateParams[] = [];
    
    // Create one request per tool result
    for (const toolIndex of toolResultIndices) {
      const filteredMessages = request.messages.filter((msg, index) => {
        if (msg.role === 'tool') {
          return index === toolIndex;
        }
        return true; // Keep all non-tool messages
      });

      requests.push({
        ...request,
        messages: filteredMessages
      });
    }

    console.log(`🔄 Split request with ${toolResultIndices.length} tool results into ${requests.length} individual requests`);
    
    return requests;
  }

  /**
   * Combines responses from multiple single-tool requests
   */
  combineSingleToolResponses(
    responses: OpenAI.Chat.Completions.ChatCompletion[]
  ): OpenAI.Chat.Completions.ChatCompletion {
    if (responses.length === 0) {
      throw new Error('No responses to combine');
    }

    if (responses.length === 1) {
      return responses[0];
    }

    // Use the last response as the base (contains the final assistant message)
    const baseResponse = responses[responses.length - 1];
    
    // Sum up usage statistics
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;

    for (const response of responses) {
      if (response.usage) {
        totalPromptTokens += response.usage.prompt_tokens || 0;
        totalCompletionTokens += response.usage.completion_tokens || 0;
        totalTokens += response.usage.total_tokens || 0;
      }
    }

    return {
      ...baseResponse,
      usage: {
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        total_tokens: totalTokens
      }
    };
  }

  /**
   * Detects if error is the "list index out of range" error
   */
  isListIndexError(error: unknown): boolean {
    const errorMessage = (error as any)?.message || (error as any)?.error?.message || '';
    return errorMessage.includes('list index out of range') || 
           errorMessage.includes('Exception: list index out of range');
  }

  private findToolResultIndices(request: OpenAI.Chat.Completions.ChatCompletionCreateParams): number[] {
    const indices: number[] = [];
    request.messages.forEach((msg, index) => {
      if (msg.role === 'tool') {
        indices.push(index);
      }
    });
    return indices;
  }
}