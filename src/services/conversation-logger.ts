import fs from 'fs';
import path from 'path';
import { AnthropicRequest, AnthropicResponse, AnthropicStreamResponse } from '../types';
import { ConfigManager } from '../utils/config';

export interface ConversationLogEntry {
  timestamp: string;
  request_id?: string;
  model: string;
  request: AnthropicRequest;
  response: AnthropicResponse;
  duration_ms?: number;
  is_stream?: boolean;
}

interface StreamingSession {
  request: AnthropicRequest;
  startTime: number;
  requestId?: string;
  accumulatedContent: string;
  stopReason?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class ConversationLogger {
  private static instance: ConversationLogger;
  private config = ConfigManager.getInstance().getConfig();
  private streamingSessions: Map<string, StreamingSession> = new Map();

  private constructor() {}

  static getInstance(): ConversationLogger {
    if (!ConversationLogger.instance) {
      ConversationLogger.instance = new ConversationLogger();
    }
    return ConversationLogger.instance;
  }

  public async logConversation(
    request: AnthropicRequest,
    response: AnthropicResponse,
    options: {
      requestId?: string;
      durationMs?: number;
    } = {}
  ): Promise<void> {
    if (!this.config.logging.conversation_logging.enabled) {
      return;
    }

    const logEntry: ConversationLogEntry = {
      timestamp: new Date().toISOString(),
      request_id: options.requestId,
      model: request.model,
      request: this.sanitizeRequest(request),
      response: this.sanitizeResponse(response),
      duration_ms: options.durationMs
    };

    try {
      await this.writeToFile(logEntry);
    } catch (error) {
      console.error('Failed to write conversation log:', error);
    }
  }

  private sanitizeRequest(request: AnthropicRequest): AnthropicRequest {
    const sanitized = { ...request };
    
    // Filter out system messages if not configured to include them
    if (!this.config.logging.conversation_logging.include_system_messages) {
      delete sanitized.system;
    }

    return sanitized;
  }

  private sanitizeResponse(response: AnthropicResponse): AnthropicResponse {
    // For now, include full response. Could add filtering options later.
    return { ...response };
  }

  private async writeToFile(logEntry: ConversationLogEntry): Promise<void> {
    const filePath = this.config.logging.conversation_logging.file_path || './conversations.log';
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const entryToLog = this.config.logging.conversation_logging.include_timestamps
      ? logEntry
      : { ...logEntry, timestamp: undefined };

    // Write pretty-formatted JSON with separator
    const prettyJson = JSON.stringify(entryToLog, null, 2);
    const logEntry_formatted = prettyJson + '\n' + '---\n';

    fs.appendFileSync(filePath, logEntry_formatted, 'utf8');
  }

  public getLogFilePath(): string {
    return this.config.logging.conversation_logging.file_path || './conversations.log';
  }

  public isEnabled(): boolean {
    return this.config.logging.conversation_logging.enabled;
  }

  public startStreamingSession(request: AnthropicRequest, sessionId: string): void {
    if (!this.config.logging.conversation_logging.enabled) {
      return;
    }

    this.streamingSessions.set(sessionId, {
      request: this.sanitizeRequest(request),
      startTime: Date.now(),
      accumulatedContent: '',
      stopReason: undefined,
      usage: undefined
    });
  }

  public addStreamChunk(sessionId: string, chunk: AnthropicStreamResponse): void {
    if (!this.config.logging.conversation_logging.enabled) {
      return;
    }

    const session = this.streamingSessions.get(sessionId);
    if (!session) {
      return;
    }

    // Handle different chunk types
    switch (chunk.type) {
      case 'message_start':
        if (chunk.message?.id) {
          session.requestId = chunk.message.id;
        }
        if (chunk.message?.usage) {
          session.usage = {
            input_tokens: chunk.message.usage.input_tokens,
            output_tokens: chunk.message.usage.output_tokens
          };
        }
        break;
      
      case 'content_block_delta':
        if (chunk.delta?.text) {
          session.accumulatedContent += chunk.delta.text;
        }
        break;

      case 'message_delta':
        if (chunk.delta?.stop_reason) {
          session.stopReason = chunk.delta.stop_reason;
        }
        if (chunk.delta?.usage?.output_tokens) {
          if (session.usage) {
            session.usage.output_tokens = chunk.delta.usage.output_tokens;
          }
        }
        break;
    }
  }

  public async finishStreamingSession(sessionId: string): Promise<void> {
    if (!this.config.logging.conversation_logging.enabled) {
      return;
    }

    const session = this.streamingSessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      // Construct a complete AnthropicResponse from the accumulated stream data
      const response: AnthropicResponse = {
        id: session.requestId || `stream_${sessionId}`,
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'text',
          text: session.accumulatedContent
        }],
        model: session.request.model,
        stop_reason: (session.stopReason as 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use') || 'end_turn',
        usage: session.usage || {
          input_tokens: 0,
          output_tokens: 0
        }
      };

      // Log the complete conversation
      const logEntry: ConversationLogEntry = {
        timestamp: new Date().toISOString(),
        request_id: session.requestId,
        model: session.request.model,
        request: session.request,
        response: response,
        duration_ms: Date.now() - session.startTime,
        is_stream: true
      };

      await this.writeToFile(logEntry);
    } catch (error) {
      console.error('Failed to log streaming conversation:', error);
    } finally {
      // Clean up the session
      this.streamingSessions.delete(sessionId);
    }
  }

  public cleanupStreamingSession(sessionId: string): void {
    this.streamingSessions.delete(sessionId);
  }
}