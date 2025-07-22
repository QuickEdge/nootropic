import OpenAI from 'openai';
import { Stream } from 'openai/streaming';
import { ModelConfig } from '../utils/config';

export class OpenAIService {
  private client: OpenAI;
  private modelConfig: ModelConfig;

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
  }

  async createChatCompletion(request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    try {
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
        
        // Check for the specific list index error and log more details
        if (error.message && error.message.includes('list index out of range')) {
          console.error('\n🚨 LIST INDEX OUT OF RANGE ERROR DETECTED:');
          console.error('Full request body that caused the error:');
          console.error(JSON.stringify(request, null, 2));
          
          // Analyze the request structure
          const toolResultCount = request.messages.filter(msg => msg.role === 'tool').length;
          const toolCallCount = request.messages.filter(msg => 
            msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls
          ).length;
          
          console.error('Request analysis:');
          console.error(`- Total messages: ${request.messages.length}`);
          console.error(`- Tool result messages: ${toolResultCount}`);
          console.error(`- Messages with tool calls: ${toolCallCount}`);
          console.error(`- Model: ${request.model}`);
          console.error(`- Stream: ${request.stream}`);
          console.error(`- Tools defined: ${request.tools ? request.tools.length : 0}`);
        } else {
          console.error(`Request Body (preview):`, JSON.stringify(request).slice(0, 500));
        }
        
        throw new Error(`OpenAI API error: ${error.message} (POST ${fullUrl} - ${error.status})`);
      }
      throw error;
    }
  }

  async createChatCompletionStream(request: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming): Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>> {
    try {
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
        
        // Check for the specific list index error and log more details
        if (error.message && error.message.includes('list index out of range')) {
          console.error('\n🚨 LIST INDEX OUT OF RANGE ERROR DETECTED (STREAMING):');
          console.error('Full streaming request body that caused the error:');
          console.error(JSON.stringify(request, null, 2));
          
          // Analyze the request structure
          const toolResultCount = request.messages.filter(msg => msg.role === 'tool').length;
          const toolCallCount = request.messages.filter(msg => 
            msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls
          ).length;
          
          console.error('Streaming request analysis:');
          console.error(`- Total messages: ${request.messages.length}`);
          console.error(`- Tool result messages: ${toolResultCount}`);
          console.error(`- Messages with tool calls: ${toolCallCount}`);
          console.error(`- Model: ${request.model}`);
          console.error(`- Stream: ${request.stream}`);
          console.error(`- Tools defined: ${request.tools ? request.tools.length : 0}`);
          console.error(`- Stream options: ${JSON.stringify(request.stream_options)}`);
        } else {
          console.error(`Request Body (preview):`, JSON.stringify(request).slice(0, 500));
        }
        
        throw new Error(`OpenAI API error: ${error.message} (POST ${fullUrl} - ${error.status})`);
      }
      throw error;
    }
  }

}