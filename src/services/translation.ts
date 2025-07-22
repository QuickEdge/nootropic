import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { ModelConfig } from '../utils/config';

export class TranslationService {
  static anthropicToOpenAI(request: Anthropic.Messages.MessageCreateParams, modelConfig: ModelConfig): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming | OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
    const { messages, system } = request;
    
    const openAIMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    
    if (system) {
      openAIMessages.push({
        role: 'system',
        content: this.translateSystemContent(system)
      });
    }
    
    const conversationMessages = messages.flatMap(msg => 
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

  private static translateSystemContent(system: string | Anthropic.Messages.TextBlockParam[]): string {
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

  private static translateAnthropicMessage(message: Anthropic.Messages.MessageParam): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    // Simple string content
    if (typeof message.content === 'string') {
      if (message.role === 'assistant') {
        return [{
          role: 'assistant',
          content: message.content,
        }];
      } else {
        return [{
          role: 'user',
          content: message.content,
        }];
      }
    }

    // Handle complex content blocks
    const results: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    
    // Extract different content types
    const textAndImageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
    const toolUseBlocks: Anthropic.Messages.ToolUseBlockParam[] = [];
    const toolResultBlocks: Anthropic.Messages.ToolResultBlockParam[] = [];

    message.content.forEach((item: Anthropic.Messages.ContentBlockParam) => {
      // Note: cache_control is intentionally filtered out as OpenAI-compatible APIs don't support it
      if (item.type === 'text') {
        textAndImageContent.push({
          type: 'text' as const,
          text: item.text || '',
        });
      } else if (item.type === 'image') {
        const source = item.source;
        if (source && source.type === 'base64') {
          textAndImageContent.push({
            type: 'image_url' as const,
            image_url: {
              url: `data:${source.media_type};base64,${source.data}`,
            },
          });
        }
      } else if (item.type === 'tool_use') {
        toolUseBlocks.push(item);
      } else if (item.type === 'tool_result') {
        toolResultBlocks.push(item);
      }
    });

    // Handle assistant messages
    if (message.role === 'assistant') {
      const textContent = textAndImageContent
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join('\n');
      
      // Convert tool_use blocks to tool_calls
      const toolCalls = toolUseBlocks.map((toolUse) => ({
        id: toolUse.id,
        type: 'function' as const,
        function: {
          name: toolUse.name,
          arguments: JSON.stringify(toolUse.input),
        },
      }));

      if (toolCalls.length > 0) {
        // Assistant message with tool calls
        results.push({
          role: 'assistant',
          content: textContent || null,
          tool_calls: toolCalls,
        });
      } else {
        // Regular assistant message
        results.push({
          role: 'assistant',
          content: textContent,
        });
      }
    } else {
      // Handle user messages
      // First, add any text/image content as a user message
      if (textAndImageContent.length > 0) {
        results.push({
          role: 'user',
          content: textAndImageContent.length === 1 && textAndImageContent[0].type === 'text' 
            ? textAndImageContent[0].text 
            : textAndImageContent,
        });
      }

      // Then, add tool result messages
      toolResultBlocks.forEach(toolResult => {
        results.push({
          role: 'tool',
          tool_call_id: toolResult.tool_use_id,
          content: typeof toolResult.content === 'string' 
            ? toolResult.content 
            : JSON.stringify(toolResult.content),
        });
      });
    }

    return results;
  }

  private static translateAnthropicTools(tools: Anthropic.Messages.ToolUnion[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map(tool => {
      // Handle different tool types in the ToolUnion
      if ('input_schema' in tool) {
        // This is a standard Tool with input_schema
        return {
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description || '',
            parameters: tool.input_schema as Record<string, unknown>,
          },
        };
      } else if (tool.type === 'bash_20250124') {
        // ToolBash20250124 - generate schema based on known structure
        return {
          type: 'function' as const,
          function: {
            name: tool.name,
            description: 'Execute bash commands',
            parameters: {
              type: 'object',
              properties: {
                command: {
                  type: 'string',
                  description: 'The bash command to execute'
                }
              },
              required: ['command']
            },
          },
        };
      } else if (tool.type === 'text_editor_20250124') {
        // ToolTextEditor20250124 - generate schema based on known structure
        return {
          type: 'function' as const,
          function: {
            name: tool.name,
            description: 'Edit text files',
            parameters: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Path to the file'
                },
                content: {
                  type: 'string',
                  description: 'New content for the file'
                }
              },
              required: ['path', 'content']
            },
          },
        };
      } else if (tool.type === 'text_editor_20250429') {
        // TextEditor20250429 - str_replace_based_edit_tool
        return {
          type: 'function' as const,
          function: {
            name: tool.name,
            description: 'String replacement based text editor',
            parameters: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Path to the file'
                },
                old_str: {
                  type: 'string',
                  description: 'String to replace'
                },
                new_str: {
                  type: 'string',
                  description: 'Replacement string'
                }
              },
              required: ['path', 'old_str', 'new_str']
            },
          },
        };
      } else if (tool.type === 'web_search_20250305') {
        // WebSearchTool20250305 - matches official Anthropic API schema
        return {
          type: 'function' as const,
          function: {
            name: tool.name,
            description: 'Search the web for information',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The search query to execute'
                }
              },
              required: ['query'],
              additionalProperties: false
            },
          },
        };
      } else {
        // Unknown tool type - create minimal schema
        const unknownTool = tool as { name?: string };
        console.warn(`Unknown tool type in ToolUnion: ${JSON.stringify(unknownTool)}`);
        return {
          type: 'function' as const,
          function: {
            name: unknownTool.name || 'unknown',
            description: 'Unknown tool type',
            parameters: {
              type: 'object',
              properties: {},
            },
          },
        };
      }
    });
  }

  private static parseMultipleJSONObjects(jsonString: string): unknown {
    const objects = [];
    let braceCount = 0;
    let start = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            // Found complete object
            const objStr = jsonString.slice(start, i + 1).trim();
            if (objStr) {
              objects.push(JSON.parse(objStr));
            }
            start = i + 1;
          }
        }
      }
    }
    
    return objects.length === 1 ? objects[0] : objects;
  }

  private static safeParseToolArguments(argumentsString: string): unknown {
    try {
      // Try normal parsing first
      return JSON.parse(argumentsString);
    } catch (error) {
      console.warn('🔄 Standard JSON parse failed, trying multiple object parsing');
      try {
        return this.parseMultipleJSONObjects(argumentsString);
      } catch (multiError) {
        console.error('❌ All parsing strategies failed:', {
          original: (error as Error).message,
          multiple: (multiError as Error).message,
          arguments: argumentsString
        });
        
        // Last resort: return raw string
        return { 
          raw_arguments: argumentsString, 
          parse_error: (error as Error).message 
        };
      }
    }
  }

  private static translateAnthropicToolChoice(toolChoice: Anthropic.Messages.ToolChoice | undefined): OpenAI.Chat.Completions.ChatCompletionToolChoiceOption {
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
    const content: Anthropic.Messages.ContentBlock[] = [];
    
    if (typeof message.content === 'string' && message.content) {
      content.push({
        type: 'text',
        text: message.content,
        citations: null
      } as Anthropic.Messages.TextBlock);
    }

    if (message.tool_calls) {
      message.tool_calls.forEach(toolCall => {
        console.log('🔧 Parsing tool call arguments:', {
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments
        });
        
        try {
          const parsedInput = this.safeParseToolArguments(toolCall.function.arguments);
          content.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.function.name,
            input: parsedInput,
          } as Anthropic.Messages.ToolUseBlock);
        } catch (error) {
          console.error('❌ Failed to parse tool call arguments:', {
            toolId: toolCall.id,
            toolName: toolCall.function.name,
            arguments: toolCall.function.arguments,
            error: (error as Error).message
          });
          throw error; // Re-throw to maintain existing behavior
        }
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
      stop_sequence: null,
      usage: {
        input_tokens: response.usage?.prompt_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0,
        // These fields are not provided by OpenAI, so we set them to null
        // as they represent Anthropic-specific features
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        server_tool_use: null,
        // OpenAI doesn't have service tiers like Anthropic, default to standard
        service_tier: 'standard' as Anthropic.Messages.Usage['service_tier']
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