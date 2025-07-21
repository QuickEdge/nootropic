import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicRequest,
  AnthropicMessage,
  AnthropicContent,
  AnthropicTool
} from '../types';
import { ModelConfig } from '../utils/config';

type AnthropicToolChoice = { type: 'auto' | 'any' | 'tool'; name?: string };

export class TranslationService {
  static anthropicToOpenAI(request: AnthropicRequest, modelConfig: ModelConfig): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming | OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
    const { messages, system } = request;
    
    const openAIMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    
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

    const baseParams = {
      model: this.translateModel(request.model, modelConfig),
      max_tokens: request.max_tokens,
      messages: openAIMessages,
      temperature: request.temperature,
      top_p: request.top_p,
      tools: request.tools ? this.translateAnthropicTools(request.tools) : undefined,
      tool_choice: request.tool_choice ? this.translateAnthropicToolChoice(request.tool_choice) : undefined,
      stop: request.stop_sequences ? request.stop_sequences[0] : undefined,
    };

    if (request.stream) {
      return {
        ...baseParams,
        stream: true,
        stream_options: { include_usage: true },
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
    } else {
      return {
        ...baseParams,
        stream: false,
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
    }
  }

  private static translateSystemContent(system: string | AnthropicContent[]): string {
    if (typeof system === 'string') {
      return system;
    }
    
    // For system messages, OpenAI only supports text content, so we'll combine all text parts
    const textParts = system
      .filter(item => item.type === 'text')
      .map(item => item.text || '')
      .join('\n');
    
    return textParts;
  }

  private static translateAnthropicMessage(message: AnthropicMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
    if (typeof message.content === 'string') {
      if (message.role === 'assistant') {
        return {
          role: 'assistant',
          content: message.content,
        };
      } else {
        return {
          role: 'user',
          content: message.content,
        };
      }
    }

    // Handle complex content with text and images
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = message.content
      .map(item => {
        // Note: cache_control is intentionally filtered out as OpenAI-compatible APIs don't support it
        if (item.type === 'text') {
          return {
            type: 'text' as const,
            text: item.text || '',
          };
        } else if (item.type === 'image') {
          const source = item.source;
          if (source && source.type === 'base64') {
            return {
              type: 'image_url' as const,
              image_url: {
                url: `data:${source.media_type};base64,${source.data}`,
              },
            };
          }
        }
        
        return null;
      })
      .filter(Boolean) as OpenAI.Chat.Completions.ChatCompletionContentPart[];

    if (message.role === 'assistant') {
      // Assistant messages can only have text content in OpenAI
      const textContent = content
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');
      
      return {
        role: 'assistant',
        content: textContent,
      };
    } else {
      return {
        role: 'user',
        content,
      };
    }
  }

  private static translateAnthropicTools(tools: AnthropicTool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema as Record<string, unknown>,
      },
    }));
  }

  private static translateAnthropicToolChoice(toolChoice: AnthropicToolChoice | undefined): OpenAI.Chat.Completions.ChatCompletionToolChoiceOption {
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
        type: 'function' as const,
        function: { name: toolChoice.name },
      };
    }
    return 'auto';
  }

  private static translateModel(anthropicModel: string, modelConfig: ModelConfig): string {
    // Simply use the model_name from the provided modelConfig
    return modelConfig.config.model_name;
  }

  static openAIToAnthropic(response: OpenAI.Chat.Completions.ChatCompletion, originalModel: string): Anthropic.Messages.Message {
    console.log('🔍 OpenAI response received:', JSON.stringify(response, null, 2));
    
    if (!response.choices || response.choices.length === 0) {
      console.error('❌ OpenAI response structure:', response);
      throw new Error(`OpenAI response has no choices. Response: ${JSON.stringify(response)}`);
    }
    
    const choice = response.choices[0];
    if (!choice.message) {
      throw new Error('OpenAI choice has no message');
    }
    
    const message = choice.message;
    const content: Anthropic.Messages.MessageParam['content'] = [];
    
    if (typeof message.content === 'string' && message.content) {
      content.push({
        type: 'text',
        text: message.content,
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
        input_tokens: response.usage?.prompt_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0,
      },
    } as Anthropic.Messages.Message;
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