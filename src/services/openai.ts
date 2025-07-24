import OpenAI from 'openai';
import { Stream } from 'openai/streaming';
import { ModelConfig } from '../utils/config';
import Logger from '../utils/logger';

export class OpenAIService {
  private client: OpenAI;
  private modelConfig: ModelConfig;

  constructor(modelConfig: ModelConfig) {
    this.modelConfig = modelConfig;
    
    if (!modelConfig.config.api_key) {
      throw new Error(`API key is required for model ${modelConfig.display_name}`);
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
        Logger.debug('Complete request being sent to provider', {
          provider: this.modelConfig.config.base_url,
          model: request.model,
          hasTools,
          toolResultCount,
          messageCount: request.messages.length
        });
        
        // Log full tool definitions structure
        if (hasTools) {
          Logger.debug('Tool definitions being sent', { tools: request.tools });
        }
        
        // Log message structure for debugging
        Logger.debug('Message structure', {
          messages: request.messages.map((msg, index) => ({
            index: index + 1,
            role: msg.role,
            toolCalls: msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls ? msg.tool_calls.length : undefined,
            toolCallId: msg.role === 'tool' ? (msg as any).tool_call_id : undefined,
            contentPreview: typeof msg.content === 'string' ? msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '') : '[complex content]'
          }))
        });
        
        // Summary
        Logger.debug('Request summary', {
          totalMessages: request.messages.length,
          toolDefinitions: hasTools ? request.tools!.length : 0,
          toolResultMessages: toolResultCount
        });
      }
      
      // Log the exact request for debugging tool issues
      if (toolResultCount > 0) {
        Logger.debug('Full request with tool results', {
          model: request.model,
          messages: request.messages.map(msg => {
            if (msg.role === 'tool') {
              return {
                role: msg.role,
                tool_call_id: (msg as any).tool_call_id,
                content: typeof msg.content === 'string' ? msg.content.substring(0, 100) + '...' : '[complex content]'
              };
            } else if (msg.role === 'assistant' && 'tool_calls' in msg) {
              return {
                role: msg.role,
                content: msg.content,
                tool_calls: (msg as any).tool_calls
              };
            }
            return msg;
          }),
          tools: request.tools ? `[${request.tools.length} tools defined]` : undefined
        });
      }
      
      const response = await this.client.chat.completions.create(request) as OpenAI.Chat.Completions.ChatCompletion;
      return response;
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        const fullUrl = `${this.modelConfig.config.base_url}/v1/chat/completions`;
        
        Logger.error('OpenAI API Request Failed', {
          url: `POST ${fullUrl}`,
          status: error.status,
          message: error.message,
          type: error.type
        });
        
        // Check for the specific list index error and log more details
        if (error.message && error.message.includes('list index out of range')) {
          const errorToolResultCount = request.messages.filter(msg => msg.role === 'tool').length;
          const toolCallCount = request.messages.filter(msg => 
            msg.role === 'assistant' && 'tool_calls' in msg && (msg as any).tool_calls
          ).length;
          
          Logger.error('LIST INDEX OUT OF RANGE ERROR DETECTED', {
            fullRequest: request,
            analysis: {
              totalMessages: request.messages.length,
              toolResultMessages: errorToolResultCount,
              messagesWithToolCalls: toolCallCount,
              model: request.model,
              stream: request.stream,
              toolsDefined: request.tools ? request.tools.length : 0,
              toolNames: request.tools ? request.tools.map((tool, idx) => `${idx + 1}. ${tool.function.name}`) : []
            }
          });
        } else {
          Logger.error('OpenAI API Request Body Preview', {
            requestPreview: JSON.stringify(request).slice(0, 500)
          });
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
        Logger.debug('Streaming request to provider', {
          provider: this.modelConfig.config.base_url,
          model: request.model,
          messageCount: request.messages.length,
          toolCount: hasTools ? request.tools!.length : 0,
          toolResultCount
        });
        
        if (hasTools) {
          Logger.debug('Streaming tool definitions', { tools: request.tools });
        }
      }
      
      const response = await this.client.chat.completions.create(request);
      return response;
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        const fullUrl = `${this.modelConfig.config.base_url}/v1/chat/completions`;
        
        Logger.error('OpenAI API Stream Request Failed', {
          url: `POST ${fullUrl}`,
          status: error.status,
          message: error.message,
          type: error.type
        });
        
        // Check for the specific list index error and log more details
        if (error.message && error.message.includes('list index out of range')) {
          const streamToolResultCount = request.messages.filter(msg => msg.role === 'tool').length;
          const streamToolCallCount = request.messages.filter(msg => 
            msg.role === 'assistant' && 'tool_calls' in msg && (msg as any).tool_calls
          ).length;
          
          Logger.error('LIST INDEX OUT OF RANGE ERROR DETECTED (STREAMING)', {
            fullStreamingRequest: request,
            analysis: {
              totalMessages: request.messages.length,
              toolResultMessages: streamToolResultCount,
              messagesWithToolCalls: streamToolCallCount,
              model: request.model,
              stream: request.stream,
              toolsDefined: request.tools ? request.tools.length : 0,
              streamOptions: request.stream_options
            }
          });
        } else {
          Logger.error('Streaming Request Body Preview', {
            requestPreview: JSON.stringify(request).slice(0, 500)
          });
        }
        
        throw new Error(`OpenAI API error: ${error.message} (POST ${fullUrl} - ${error.status})`);
      }
      throw error;
    }
  }

}