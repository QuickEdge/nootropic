import { randomBytes } from 'crypto';

/**
 * Manages bidirectional mapping between Anthropic and OpenAI tool IDs
 * to ensure consistent tool call identification across the proxy translation
 */
export class ToolIdMapper {
  private anthropicToOpenAI = new Map<string, string>();
  private openAIToAnthropic = new Map<string, string>();

  /**
   * Creates a bidirectional mapping between Anthropic and OpenAI tool IDs
   */
  mapIds(anthropicId: string, openAIId: string): void {
    console.log(`🔗 Creating ID mapping: ${anthropicId} → ${openAIId}`);
    
    // Check for existing mappings to detect conflicts
    const existingOpenAI = this.anthropicToOpenAI.get(anthropicId);
    const existingAnthropic = this.openAIToAnthropic.get(openAIId);
    
    if (existingOpenAI && existingOpenAI !== openAIId) {
      console.warn(`⚠️ Anthropic ID ${anthropicId} already mapped to ${existingOpenAI}, overwriting with ${openAIId}`);
    }
    
    if (existingAnthropic && existingAnthropic !== anthropicId) {
      console.warn(`⚠️ OpenAI ID ${openAIId} already mapped to ${existingAnthropic}, overwriting with ${anthropicId}`);
    }
    
    this.anthropicToOpenAI.set(anthropicId, openAIId);
    this.openAIToAnthropic.set(openAIId, anthropicId);
  }

  /**
   * Gets the OpenAI tool ID for a given Anthropic tool ID
   */
  getOpenAIId(anthropicId: string): string | undefined {
    return this.anthropicToOpenAI.get(anthropicId);
  }

  /**
   * Gets the Anthropic tool ID for a given OpenAI tool ID  
   */
  getAnthropicId(openAIId: string): string | undefined {
    return this.openAIToAnthropic.get(openAIId);
  }

  /**
   * Generates a unique OpenAI-compatible tool call ID using UUID
   */
  generateOpenAIId(): string {
    // Generate a shorter UUID-like ID for tool calls
    const uuid = randomBytes(8).toString('hex');
    return `call_${uuid}`;
  }

  /**
   * Maps an Anthropic tool ID to a new OpenAI ID and stores the mapping
   */
  mapAnthropicId(anthropicId: string): string {
    // Check if we already have a mapping for this Anthropic ID
    const existingOpenAIId = this.getOpenAIId(anthropicId);
    if (existingOpenAIId) {
      return existingOpenAIId;
    }

    // Generate new OpenAI ID and create mapping
    const openAIId = this.generateOpenAIId();
    this.mapIds(anthropicId, openAIId);
    return openAIId;
  }

  /**
   * Maps an OpenAI tool ID back to its original Anthropic ID
   */
  mapOpenAIId(openAIId: string): string {
    const anthropicId = this.getAnthropicId(openAIId);
    if (!anthropicId) {
      console.warn('⚠️ No Anthropic ID found for OpenAI ID:', openAIId);
      return openAIId; // Fallback to original ID
    }
    return anthropicId;
  }

  /**
   * Generates an OpenAI-compatible ID from an Anthropic ID
   * Used for Claude Code internal tool IDs that don't have existing mappings
   */
  generateOpenAICompatibleId(anthropicId: string): string {
    // Convert various Anthropic ID formats to OpenAI-compatible format
    // Handle patterns like: functions.Glob:1, Read:23, 0, toolu_123, etc.
    
    if (anthropicId.startsWith('functions.')) {
      // functions.Glob:1 → call_func_Glob_1
      const match = anthropicId.match(/functions\.([^:]+):?(\d*)/);
      if (match) {
        const toolName = match[1];
        const index = match[2] || '0';
        return `call_func_${toolName}_${index}`;
      }
    }
    
    if (anthropicId.includes(':')) {
      // Read:23 → call_Read_23  
      const [toolName, index] = anthropicId.split(':');
      return `call_${toolName}_${index || '0'}`;
    }
    
    if (/^\d+$/.test(anthropicId)) {
      // 0 → call_tool_0
      return `call_tool_${anthropicId}`;
    }
    
    if (anthropicId.startsWith('toolu_')) {
      // toolu_123 → call_toolu_123
      return `call_${anthropicId}`;
    }
    
    // Fallback: sanitize and add UUID
    const sanitized = anthropicId.replace(/[^a-zA-Z0-9_]/g, '_');
    const uuid = randomBytes(4).toString('hex');
    return `call_${sanitized}_${uuid}`;
  }

  /**
   * Gets existing OpenAI ID or generates a new one for unmapped Anthropic IDs
   * Returns both the ID and whether it was found (true) or generated (false)
   */
  getOrCreateOpenAIId(anthropicId: string): { openaiId: string; wasFound: boolean } {
    // First try to find existing mapping
    const existingOpenAIId = this.getOpenAIId(anthropicId);
    if (existingOpenAIId) {
      return { openaiId: existingOpenAIId, wasFound: true };
    }

    // No existing mapping - generate new OpenAI-compatible ID
    const generatedId = this.generateOpenAICompatibleId(anthropicId);
    
    // Store the new mapping for consistency
    this.mapIds(anthropicId, generatedId);
    
    return { openaiId: generatedId, wasFound: false };
  }

  /**
   * Clears all mappings (useful for new conversations)
   */
  clear(): void {
    this.anthropicToOpenAI.clear();
    this.openAIToAnthropic.clear();
    console.log('🧹 Cleared tool ID mappings');
  }

  /**
   * Gets current mapping statistics for debugging
   */
  getStats(): { mappingCount: number; anthropicIds: string[]; openAIIds: string[] } {
    return {
      mappingCount: this.anthropicToOpenAI.size,
      anthropicIds: Array.from(this.anthropicToOpenAI.keys()),
      openAIIds: Array.from(this.openAIToAnthropic.keys())
    };
  }
}