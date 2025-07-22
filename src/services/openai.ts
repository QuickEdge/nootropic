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
        console.log('\n📤 COMPLETE REQUEST BEING SENT TO PROVIDER:');
        console.log(`Provider: ${this.modelConfig.config.base_url}`);
        console.log(`Model: ${request.model}`);
        
        // Log full tool definitions structure
        if (hasTools) {
          console.log('\n🔧 TOOL DEFINITIONS BEING SENT:');
          console.log(JSON.stringify(request.tools, null, 2));
        }
        
        // Log message structure
        console.log('\n💬 MESSAGE STRUCTURE:');
        request.messages.forEach((msg, index) => {
          console.log(`Message ${index + 1}:`);
          console.log(`  Role: ${msg.role}`);
          
          if (msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls) {
            console.log(`  Tool calls: ${msg.tool_calls.length}`);
            msg.tool_calls.forEach((tc, tcIndex) => {
              console.log(`    ${tcIndex + 1}. ID: ${tc.id}, Function: ${tc.function.name}`);
              console.log(`       Args: ${tc.function.arguments.substring(0, 100)}${tc.function.arguments.length > 100 ? '...' : ''}`);
            });
          } else if (msg.role === 'tool') {
            console.log(`  Tool call ID: ${msg.tool_call_id}`);
            const content = typeof msg.content === 'string' ? msg.content : '[complex content]';
            console.log(`  Content: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
          } else {
            const content = typeof msg.content === 'string' ? msg.content : 
                           Array.isArray(msg.content) ? '[array content]' : '[complex content]';
            if (typeof content === 'string') {
              console.log(`  Content: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
            } else {
              console.log(`  Content: ${content}`);
            }
          }
        });
        
        // Summary
        console.log('\n📊 REQUEST SUMMARY:');
        console.log(`- Total messages: ${request.messages.length}`);
        console.log(`- Tool definitions: ${hasTools ? request.tools!.length : 0}`);
        console.log(`- Tool result messages: ${toolResultCount}`);
        console.log('='.repeat(80));
      }
      
      // Log the exact request for debugging tool issues
      if (toolResultCount > 0) {
        console.log('\n🔍 FULL REQUEST WITH TOOL RESULTS:');
        console.log(JSON.stringify({
          model: request.model,
          messages: request.messages.map(msg => {
            if (msg.role === 'tool') {
              return {
                role: msg.role,
                tool_call_id: msg.tool_call_id,
                content: typeof msg.content === 'string' ? msg.content.substring(0, 100) + '...' : '[complex content]'
              };
            } else if (msg.role === 'assistant' && 'tool_calls' in msg) {
              return {
                role: msg.role,
                content: msg.content,
                tool_calls: msg.tool_calls
              };
            }
            return msg;
          }),
          tools: request.tools ? `[${request.tools.length} tools defined]` : undefined
        }, null, 2));
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
      // Log streaming request details  
      const toolResultCount = request.messages.filter(msg => msg.role === 'tool').length;
      const hasTools = request.tools && request.tools.length > 0;
      
      if (hasTools || toolResultCount > 0) {
        console.log('\n🌊 STREAMING REQUEST TO PROVIDER:');
        console.log(`Provider: ${this.modelConfig.config.base_url}`);
        console.log(`Model: ${request.model}`);
        
        if (hasTools) {
          console.log('\n🔧 STREAMING TOOL DEFINITIONS:');
          console.log(JSON.stringify(request.tools, null, 2));
        }
        
        console.log(`\n📊 STREAMING SUMMARY: ${request.messages.length} messages, ${hasTools ? request.tools!.length : 0} tools, ${toolResultCount} tool results`);
        console.log('='.repeat(80));
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