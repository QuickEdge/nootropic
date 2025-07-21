import fs from 'fs';
import path from 'path';
import { AnthropicRequest, AnthropicResponse } from '../types';
import { ConfigManager } from '../utils/config';

export interface ConversationLogEntry {
  timestamp: string;
  request_id?: string;
  model: string;
  request: AnthropicRequest;
  response: AnthropicResponse;
  duration_ms?: number;
}

export class ConversationLogger {
  private static instance: ConversationLogger;
  private config = ConfigManager.getInstance().getConfig();

  private constructor() {}

  // Note: Streaming responses are not currently logged as they don't have a single complete response object.
  // This could be enhanced in the future to accumulate streaming chunks into a complete response.

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
}