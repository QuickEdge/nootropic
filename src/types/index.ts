export interface OpenAILogprobs {
  content: Array<{
    token: string;
    logprob: number;
    bytes: number[] | null;
    top_logprobs: Array<{
      token: string;
      logprob: number;
      bytes: number[] | null;
    }>;
  }> | null;
}

export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OpenAIContent[];
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAIContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: OpenAITool[];
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
  user?: string;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  logprobs?: boolean;
  top_logprobs?: number;
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

export interface OpenAIChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
  system_fingerprint?: string;
}

export interface OpenAIChoice {
  index: number;
  message: OpenAIChatMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  logprobs?: OpenAILogprobs | null;
}

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAIStreamResponse {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: OpenAIStreamChoice[];
  system_fingerprint?: string;
}

export interface OpenAIStreamChoice {
  index: number;
  delta: {
    role?: string;
    content?: string;
    tool_calls?: OpenAIToolCall[];
  };
  finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  logprobs?: OpenAILogprobs | null;
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContent[];
}

export interface AnthropicContent {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
  cache_control?: {
    type: 'ephemeral';
  };
}

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string | AnthropicContent[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: AnthropicTool[];
  tool_choice?: {
    type: 'auto' | 'any' | 'tool';
    name?: string;
  };
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: object;
}

export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContent[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AnthropicStreamResponse {
  type: 'content_block_delta' | 'message_start' | 'content_block_start' | 'content_block_stop' | 'message_delta';
  index?: number;
  delta?: {
    text?: string;
    stop_reason?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
  message?: {
    id: string;
    type: 'message';
    role: 'assistant';
    content: AnthropicContent[];
    model: string;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  content_block?: {
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
}