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
      // Log comprehensive request details for debugging
      const toolResultCount = request.messages.filter(msg => msg.role === 'tool').length;
      const hasTools = request.tools && request.tools.length > 0;
      
      if (hasTools || toolResultCount > 0) {
        console.log('\n📤 OPENAI API REQUEST DETAILS:');
        console.log(`Provider: ${this.modelConfig.config.base_url}`);
        console.log(`Model: ${request.model}`);
        console.log(`Messages: ${request.messages.length} total`);
        console.log(`Tool results: ${toolResultCount}`);
        
        if (hasTools) {
          console.log(`\n🔧 Tools defined: ${request.tools!.length}`);
          request.tools!.forEach((tool, index) => {
            console.log(`  ${index + 1}. ${tool.function.name}`);
          });
          
          // Warn if there are many tools
          if (request.tools!.length > 10) {
            console.warn(`⚠️ WARNING: Sending ${request.tools!.length} tools - some providers may have limits!`);
          }
        } else {
          console.log('\n⚠️ No tools defined in request!');
        }
        console.log('---\n');
      }
      
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
          
          if (request.tools && request.tools.length > 0) {
            console.error('\nTool definitions sent:');
            request.tools.forEach((tool, idx) => {
              console.error(`  ${idx + 1}. ${tool.function.name}`);
            });
          }
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