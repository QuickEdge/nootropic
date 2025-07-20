import fs from 'fs';
import path from 'path';
import os from 'os';
import TOML from '@iarna/toml';

export interface ModelConfig {
  id: string;
  display_name: string;
  provider: string;
  config: {
    base_url: string;
    api_key: string;
    model_name: string;
    max_tokens: number;
    temperature_range: [number, number];
    supports_streaming: boolean;
    supports_tools: boolean;
    supports_vision: boolean;
  };
  pricing?: {
    input_per_1k: number;
    output_per_1k: number;
  };
}

export interface Config {
  logging: {
    enabled: boolean;
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
  };
  server: {
    port: number;
    host: string;
    cors: {
      enabled: boolean;
      origins: string[];
    };
  };
  models: ModelConfig[];
  defaults: {
    model: string;
    max_tokens: number;
    temperature: number;
    stream: boolean;
  };
  rate_limits: {
    requests_per_minute: number;
    tokens_per_minute: number;
  };
  cache: {
    enabled: boolean;
    ttl: number;
    max_size: number;
  };
}

const DEFAULT_CONFIG: Config = {
  logging: {
    enabled: true,
    level: 'info',
    format: 'json'
  },
  server: {
    port: 3000,
    host: 'localhost',
    cors: {
      enabled: true,
      origins: ['*']
    }
  },
  models: [
    {
      id: 'claude-3-5-sonnet-20241022',
      display_name: 'Claude 3.5 Sonnet',
      provider: 'openai-compatible',
      config: {
        base_url: 'https://api.openai.com/v1',
        api_key: 'sk-your-openai-key',
        model_name: 'gpt-4o',
        max_tokens: 128000,
        temperature_range: [0, 2],
        supports_streaming: true,
        supports_tools: true,
        supports_vision: true
      },
      pricing: {
        input_per_1k: 0.003,
        output_per_1k: 0.015
      }
    },
    {
      id: 'claude-3-opus-20240229',
      display_name: 'Claude 3 Opus',
      provider: 'openai-compatible',
      config: {
        base_url: 'https://api.openai.com/v1',
        api_key: 'sk-your-openai-key',
        model_name: 'gpt-4',
        max_tokens: 8192,
        temperature_range: [0, 2],
        supports_streaming: true,
        supports_tools: true,
        supports_vision: true
      },
      pricing: {
        input_per_1k: 0.03,
        output_per_1k: 0.06
      }
    },
    {
      id: 'claude-3-haiku-20240307',
      display_name: 'Claude 3 Haiku',
      provider: 'openai-compatible',
      config: {
        base_url: 'https://api.openai.com/v1',
        api_key: 'sk-your-openai-key',
        model_name: 'gpt-4o-mini',
        max_tokens: 16384,
        temperature_range: [0, 2],
        supports_streaming: true,
        supports_tools: true,
        supports_vision: true
      },
      pricing: {
        input_per_1k: 0.00015,
        output_per_1k: 0.0006
      }
    }
  ],
  defaults: {
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 4096,
    temperature: 0.7,
    stream: false
  },
  rate_limits: {
    requests_per_minute: 60,
    tokens_per_minute: 100000
  },
  cache: {
    enabled: false,
    ttl: 300,
    max_size: 1000
  }
};

export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;
  private configPath: string;

  private constructor() {
    this.configPath = path.join(os.homedir(), '.config', 'nootropic', 'config.toml');
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): Config {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const userConfig = TOML.parse(configData) as Partial<Config>;
        return this.mergeWithDefaults(userConfig);
      } else {
        console.log('\n📝 No config file found. Creating default config...');
        this.createSampleConfig();
        console.log(`📁 Config created at: ${this.configPath}`);
        console.log('\n⚠️  Please update the API keys in the config file and restart the server.');
        console.log('   Edit: ~/.config/nootropic/config.toml');
        console.log('   Add your actual API keys for each provider (OpenAI, Groq, OpenRouter, etc.)');
        process.exit(0);
      }
    } catch (error) {
      console.error(`\n❌ Failed to load config from ${this.configPath}:`, error);
      console.log('\n📝 Creating default config...');
      this.createSampleConfig();
      console.log(`📁 Config created at: ${this.configPath}`);
      console.log('\n⚠️  Please update the API keys in the config file and restart the server.');
      process.exit(0);
    }
    return DEFAULT_CONFIG;
  }

  private mergeWithDefaults(userConfig: Partial<Config>): Config {
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      logging: { ...DEFAULT_CONFIG.logging, ...userConfig.logging },
      server: { ...DEFAULT_CONFIG.server, ...userConfig.server },
      defaults: { ...DEFAULT_CONFIG.defaults, ...userConfig.defaults },
      rate_limits: { ...DEFAULT_CONFIG.rate_limits, ...userConfig.rate_limits },
      cache: { ...DEFAULT_CONFIG.cache, ...userConfig.cache },
      models: userConfig.models || DEFAULT_CONFIG.models
    };
  }

  public getConfig(): Config {
    return this.config;
  }

  public getModelConfig(modelId: string): ModelConfig | undefined {
    return this.config.models.find(model => model.id === modelId);
  }

  public getDefaultModel(): string {
    return this.config.defaults.model;
  }

  public createConfigDirectory(): void {
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  public createSampleConfig(): void {
    this.createConfigDirectory();
    fs.writeFileSync(this.configPath, TOML.stringify(DEFAULT_CONFIG as any));
    console.log(`Sample config created at: ${this.configPath}`);
  }
}