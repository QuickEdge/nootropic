import {
  OpenAIChatRequest,
  OpenAIChatMessage,
  AnthropicRequest,
  AnthropicMessage,
  AnthropicContent,
  OpenAITool,
  AnthropicTool,
  AnthropicResponse,
  OpenAIChatResponse } from '../types';

export class TranslationService {
  static anthropicToOpenAI(request: AnthropicRequest): OpenAIChatRequest {
    const { messages, system } = request;
    
    const openAIMessages: OpenAIChatMessage[] = [];
    
    if (system) {
      openAIMessages.push({
        role: 'system',
        content: system
      });
    }
    
    const conversationMessages = messages.map(msg => 
      this.translateAnthropicMessage(msg)
    );
    
    openAIMessages.push(...conversationMessages);

    return {
      model: this.translateModel(request.model),
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

  private static translateAnthropicMessage(message: AnthropicMessage): OpenAIChatMessage {
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    
    if (typeof message.content === 'string') {
      return {
        role,
        content: message.content,
      };
    }

    const content: OpenAIContent[] = message.content.map(item => {
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

  private static translateAnthropicToolChoice(toolChoice: any): any {
    if (!toolChoice) {
      return 'auto';
    }
    if (toolChoice.type === 'auto') {
      return 'auto';
    }
    if (toolChoice.type === 'any') {
      return 'auto';
    }
    if (toolChoice.type === 'tool') {
      return {
        type: 'function',
        function: { name: toolChoice.name },
      };
    }
    return 'auto';
  }

  private static translateModel(model: string): string {
    const modelMap: Record<string, string> = {
      'claude-3-opus-20240229': 'gpt-4',
      'claude-3-sonnet-20240229': 'gpt-4-turbo',
      'claude-3-5-sonnet-20241022': 'gpt-4o',
      'claude-3-haiku-20240307': 'gpt-4o-mini',
      'claude-3-haiku-20240307': 'gpt-3.5-turbo',
    };

    return process.env.NOOTROPIC_MODEL_NAME || modelMap[model] || 'gpt-4-turbo';
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