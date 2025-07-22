import OpenAI from 'openai';
import { Stream } from 'openai/streaming';
import { ModelConfig } from '../utils/config';
import { SimpleToolBatcher } from './simple-tool-batcher';

export class OpenAIService {
  private client: OpenAI;
  private modelConfig: ModelConfig;
  private toolBatcher?: SimpleToolBatcher;

  constructor(modelConfig: ModelConfig) {
    this.modelConfig = modelConfig;
    
    if (!modelConfig.config.api_key) {
      throw new Error(`API key is required for model ${modelConfig.id}`);
    }

    this.client = new OpenAI({
      baseURL: modelConfig.config.base_url,
      apiKey: modelConfig.config.api_key,
      timeout: 60000,
    });

    // Initialize simple tool batcher if tool result limiting is enabled
    if (modelConfig.config.limit_tool_results) {
      this.toolBatcher = new SimpleToolBatcher(true);
      console.log(`🔧 Tool result batching enabled for model "${modelConfig.id}" - will send 1 tool result per request`);
    }
  }

  async createChatCompletion(request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    try {
      // Use simple tool batcher if available
      if (this.toolBatcher && this.toolBatcher.needsBatching(request)) {
        const singleToolRequests = this.toolBatcher.createSingleToolResultRequests(request);
        const responses: OpenAI.Chat.Completions.ChatCompletion[] = [];

        for (const singleRequest of singleToolRequests) {
          try {
            const response = await this.client.chat.completions.create(singleRequest) as OpenAI.Chat.Completions.ChatCompletion;
            responses.push(response);
          } catch (error) {
            // If we get the list index error, try the fallback approach
            if (this.toolBatcher.isListIndexError(error)) {
              console.log('⚠️ List index error detected, this should not happen with single tool results');
              throw error;
            } else {
              throw error;
            }
          }
        }

        const combinedResponse = this.toolBatcher.combineSingleToolResponses(responses);
        console.log(`✅ Combined ${responses.length} single-tool requests successfully`);
        return combinedResponse;
      }
      
      // Direct API call for models without batching or requests without tool results
      const response = await this.client.chat.completions.create(request) as OpenAI.Chat.Completions.ChatCompletion;
      return response;
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        const fullUrl = `${this.modelConfig.config.base_url}/v1/chat/completions`;
        
        console.error('OpenAI API Request Failed:');
        console.error(`URL: POST ${fullUrl}`);
        console.error(`Status:`, error.status);
        console.error(`Error:`, error.message);
        console.error(`Type:`, error.type);
        console.error(`Request Body (preview):`, JSON.stringify(request).slice(0, 500));
        
        throw new Error(`OpenAI API error: ${error.message} (POST ${fullUrl} - ${error.status})`);
      }
      throw error;
    }
  }

  async createChatCompletionStream(request: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming): Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>> {
    try {
      // Note: Batching is not yet implemented for streaming requests
      // This would require more complex handling of streaming responses
      // For now, fall back to direct API calls for streaming
      if (this.toolBatcher && this.containsToolResults(request)) {
        console.log('⚠️ Tool results detected in streaming request - batching not yet supported for streaming');
      }
      
      const response = await this.client.chat.completions.create(request);
      return response;
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        const fullUrl = `${this.modelConfig.config.base_url}/v1/chat/completions`;
        
        console.error('OpenAI API Stream Request Failed:');
        console.error(`URL: POST ${fullUrl}`);
        console.error(`Status:`, error.status);
        console.error(`Error:`, error.message);
        console.error(`Type:`, error.type);
        console.error(`Request Body (preview):`, JSON.stringify(request).slice(0, 500));
        
        throw new Error(`OpenAI API error: ${error.message} (POST ${fullUrl} - ${error.status})`);
      }
      throw error;
    }
  }

  /**
   * Checks if a request contains tool results that might need batching
   */
  private containsToolResults(request: OpenAI.Chat.Completions.ChatCompletionCreateParams): boolean {
    return request.messages.some(msg => msg.role === 'tool');
  }
}