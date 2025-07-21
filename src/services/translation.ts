import {
  OpenAIChatRequest,
  OpenAIChatMessage,
  OpenAIContent,
  AnthropicRequest,
  AnthropicMessage,
  AnthropicContent,
  OpenAITool,
  AnthropicTool,
  AnthropicResponse,
  OpenAIChatResponse } from '../types';
import { ModelConfig } from '../utils/config';

type OpenAIToolChoice = 'none' | 'auto' | { type: 'function'; function: { name: string } };
type AnthropicToolChoice = { type: 'auto' | 'any' | 'tool'; name?: string };

export class TranslationService {
  static anthropicToOpenAI(request: AnthropicRequest, modelConfig: ModelConfig): OpenAIChatRequest {
    const { messages, system } = request;
    
    const openAIMessages: OpenAIChatMessage[] = [];
    
    if (system) {
      openAIMessages.push({
        role: 'system',
        content: this.translateSystemContent(system)
      });
    }
    
    const conversationMessages = messages.map(msg => 
      this.translateAnthropicMessage(msg)
    );
    
    openAIMessages.push(...conversationMessages);

    return {
      model: this.translateModel(request.model, modelConfig),
      max_tokens: request.max_tokens,
      messages: openAIMessages,
      temperature: request.temperature,
      top_p: request.top_p,
      stream: request.stream,
      tools: request.tools ? this.translateAnthropicTools(request.tools) : undefined,
      tool_choice: request.tool_choice ? this.translateAnthropicToolChoice(request.tool_choice) : undefined,
      stop: request.stop_sequences ? request.stop_sequences[0] : undefined,
    };
  }

  private static translateSystemContent(system: string | AnthropicContent[]): string | OpenAIContent[] {
    if (typeof system === 'string') {
      return system;
    }
    
    // Handle array of content blocks, filtering out cache_control
    const content: OpenAIContent[] = system.map(item => {
      // Note: cache_control is intentionally filtered out as OpenAI-compatible APIs don't support it
      if (item.type === 'text') {
        return {
          type: 'text',
          text: item.text || '',
        };
      } else if (item.type === 'image') {
        const source = item.source;
        if (source && source.type === 'base64') {
          return {
            type: 'image_url',
            image_url: {
              url: `data:${source.media_type};base64,${source.data}`,
            },
          };
        }
      }
      
      return {
        type: 'text',
        text: '',
      };
    });

    return content;
  }

  private static translateAnthropicMessage(message: AnthropicMessage): OpenAIChatMessage {
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    
    if (typeof message.content === 'string') {
      return {
        role,
        content: message.content,
      };
    }

    const content: OpenAIContent[] = message.content.map(item => {
      // Note: cache_control is intentionally filtered out as OpenAI-compatible APIs don't support it
      if (item.type === 'text') {
        return {
          type: 'text',
          text: item.text || '',
        };
      } else if (item.type === 'image') {
        const source = item.source;
        if (source && source.type === 'base64') {
          return {
            type: 'image_url',
            image_url: {
              url: `data:${source.media_type};base64,${source.data}`,
            },
          };
        }
      }
      
      return {
        type: 'text',
        text: '',
      };
    });

    return {
      role,
      content,
    };
  }

  private static translateAnthropicTools(tools: AnthropicTool[]): OpenAITool[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));
  }

  private static translateAnthropicToolChoice(toolChoice: AnthropicToolChoice | undefined): OpenAIToolChoice {
    if (!toolChoice) {
      return 'auto';
    }
    if (toolChoice.type === 'auto') {
      return 'auto';
    }
    if (toolChoice.type === 'any') {
      return 'auto';
    }
    if (toolChoice.type === 'tool' && toolChoice.name) {
      return {
        type: 'function',
        function: { name: toolChoice.name },
      };
    }
    return 'auto';
  }

  private static translateModel(anthropicModel: string, modelConfig: ModelConfig): string {
    // Simply use the model_name from the provided modelConfig
    return modelConfig.config.model_name;
  }

  static openAIToAnthropic(response: OpenAIChatResponse, originalModel: string): AnthropicResponse {
    const choice = response.choices[0];
    const message = choice.message;
    
    const content: AnthropicContent[] = [];
    
    if (typeof message.content === 'string') {
      content.push({
        type: 'text',
        text: message.content,
      });
    } else if (Array.isArray(message.content)) {
      message.content.forEach(item => {
        if (item.type === 'text') {
          content.push({
            type: 'text',
            text: item.text || '',
          });
        }
      });
    }

    if (message.tool_calls) {
      message.tool_calls.forEach(toolCall => {
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments),
        });
      });
    }

    const stopReason = this.translateOpenAIFinishReason(choice.finish_reason);

    return {
      id: response.id,
      type: 'message',
      role: 'assistant',
      content,
      model: originalModel,
      stop_reason: stopReason,
      usage: {
        input_tokens: response.usage.prompt_tokens,
        output_tokens: response.usage.completion_tokens,
      },
    };
  }

  private static translateOpenAIFinishReason(reason: string | undefined): 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' {
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

  private static translateFinishReason(reason: string): 'stop' | 'length' | 'tool_calls' | 'content_filter' {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }
}