/**
 * Manages bidirectional mapping between Anthropic and OpenAI tool IDs
 * to ensure consistent tool call identification across the proxy translation
 */
export class ToolIdMapper {
  private anthropicToOpenAI = new Map<string, string>();
  private openAIToAnthropic = new Map<string, string>();
  private idCounter = 0;

  /**
   * Creates a bidirectional mapping between Anthropic and OpenAI tool IDs
   */
  mapIds(anthropicId: string, openAIId: string): void {
    this.anthropicToOpenAI.set(anthropicId, openAIId);
    this.openAIToAnthropic.set(openAIId, anthropicId);
    
    console.log('🔗 Mapped tool IDs:', { anthropicId, openAIId });
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
   * Generates a unique OpenAI-compatible tool call ID
   * Uses functions.name:index format for provider compatibility
   */
  generateOpenAIId(toolName?: string): string {
    if (toolName) {
      // Use the provider-preferred format: functions.toolname:index
      return `functions.${toolName}:${this.idCounter++}`;
    }
    // Fallback to standard OpenAI format
    return `call_${Date.now()}_${++this.idCounter}`;
  }

  /**
   * Maps an Anthropic tool ID to a new OpenAI ID and stores the mapping
   */
  mapAnthropicId(anthropicId: string, toolName?: string): string {
    // Check if we already have a mapping for this Anthropic ID
    const existingOpenAIId = this.getOpenAIId(anthropicId);
    if (existingOpenAIId) {
      return existingOpenAIId;
    }

    // Generate new OpenAI ID and create mapping
    const openAIId = this.generateOpenAIId(toolName);
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
    // Convert various Anthropic ID formats to provider-compatible format
    // Handle patterns like: functions.Glob:1, Read:23, 0, toolu_123, etc.
    
    if (anthropicId.startsWith('functions.')) {
      // functions.Glob:1 → keep as is (already correct format)
      return anthropicId;
    }
    
    if (anthropicId.includes(':')) {
      // Read:23 → functions.Read:23  
      const [toolName, index] = anthropicId.split(':');
      return `functions.${toolName}:${index || '0'}`;
    }
    
    if (/^\d+$/.test(anthropicId)) {
      // 0 → functions.tool:0
      return `functions.tool:${anthropicId}`;
    }
    
    if (anthropicId.startsWith('toolu_')) {
      // toolu_123 → functions.toolu_123:0
      return `functions.${anthropicId}:0`;
    }
    
    // Fallback: sanitize and use functions format
    const sanitized = anthropicId.replace(/[^a-zA-Z0-9_]/g, '_');
    return `functions.${sanitized}:${this.idCounter++}`;
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
    this.idCounter = 0;
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