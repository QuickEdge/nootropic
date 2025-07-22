import fs from 'fs';
import path from 'path';
import TOML from '@iarna/toml';
import xdgAppPaths from 'xdg-app-paths';
import Logger from './logger';

export interface ModelConfig {
  id: string;
  display_name: string;
  provider: string;
  config: {
    base_url: string;
    api_key: string;
    model_name: string;
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
  model_routing: {
    default_model_id?: string;
    route_claude_models_to_default?: boolean;
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
  models: [],
  defaults: {
    model: '', // Empty default - will be set when first model is added
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
  },
  model_routing: {
    default_model_id: undefined,
    route_claude_models_to_default: true
  }
};

export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;
  private configPath: string;

  private constructor(private allowEmpty: boolean = false) {
    const xdgPaths = xdgAppPaths('nootropic');
    this.configPath = path.join(xdgPaths.config(), 'config.toml');
    this.config = this.loadConfig();
  }

  static getInstance(allowEmpty: boolean = false): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(allowEmpty);
    } else if (allowEmpty !== ConfigManager.instance.allowEmpty) {
      // Create new instance with different allowEmpty setting
      ConfigManager.instance = new ConfigManager(allowEmpty);
    }
    return ConfigManager.instance;
  }

  private loadConfig(): Config {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const userConfig = TOML.parse(configData) as Partial<Config>;
        return this.mergeWithDefaults(userConfig);
      } else if (this.allowEmpty) {
        // Return empty config with defaults
        return DEFAULT_CONFIG;
      } else {
        // Hard fail - don't create sample config automatically
        Logger.error('No configuration file found!');
        Logger.error(`Expected config file at: ${this.configPath}`);
        Logger.error('Use the interactive config editor to create one: npm run config');
        Logger.error(`Or create the file manually: mkdir -p ${path.dirname(this.configPath)} && touch ${this.configPath}`);
        process.exit(1);
      }
    } catch (error) {
      Logger.error(`Failed to load config from ${this.configPath}`, { error });
      process.exit(1);
    }
  }

  private mergeWithDefaults(userConfig: Partial<Config>): Config {
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      logging: { 
        ...DEFAULT_CONFIG.logging, 
        ...(userConfig.logging || {})
      },
      server: { 
        ...DEFAULT_CONFIG.server, 
        ...(userConfig.server || {}),
        cors: {
          ...DEFAULT_CONFIG.server.cors,
          ...((userConfig.server || {}).cors || {})
        }
      },
      defaults: { 
        ...DEFAULT_CONFIG.defaults, 
        ...(userConfig.defaults || {})
      },
      rate_limits: { 
        ...DEFAULT_CONFIG.rate_limits, 
        ...(userConfig.rate_limits || {})
      },
      cache: { 
        ...DEFAULT_CONFIG.cache, 
        ...(userConfig.cache || {})
      },
      models: userConfig.models || DEFAULT_CONFIG.models,
      model_routing: {
        ...DEFAULT_CONFIG.model_routing,
        ...(userConfig.model_routing || {})
      }
    };
  }

  public getConfig(): Config {
    return this.config;
  }

  public getModelConfig(modelId: string): ModelConfig | undefined {
    return this.config.models.find(model => model.id === modelId);
  }

  public getModelConfigWithFallback(modelId: string): ModelConfig | undefined {
    // First try exact match
    const exactMatch = this.getModelConfig(modelId);
    if (exactMatch) {
      return exactMatch;
    }
    
    // If not found and starts with "claude-" and fallback is enabled
    if (modelId.startsWith('claude-') && this.config.model_routing?.route_claude_models_to_default) {
      const defaultModelId = this.getDefaultModel();
      if (defaultModelId) {
        return this.getModelConfig(defaultModelId);
      }
    }
    
    return undefined;
  }

  public getDefaultModel(): string {
    // First, check the default_model_id in model_routing section
    if (this.config.model_routing?.default_model_id) {
      return this.config.model_routing.default_model_id;
    }
    
    // Fall back to the configured default in defaults section (for backward compatibility)
    if (this.config.defaults.model) {
      return this.config.defaults.model;
    }
    
    // If no default is set anywhere, return the first model's id
    return this.config.models.length > 0 ? this.config.models[0].id : '';
  }

  public createConfigDirectory(): void {
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  public createEmptyConfig(): void {
    this.createConfigDirectory();
    const emptyConfig = {
      ...DEFAULT_CONFIG,
      models: [] // Ensure models array is empty
    };
    fs.writeFileSync(this.configPath, TOML.stringify(emptyConfig as TOML.JsonMap));
    Logger.info(`Empty configuration created at: ${this.configPath}`);
  }

  public createSampleConfig(): void {
    this.createEmptyConfig();
  }

  public getConfigPath(): string {
    return this.configPath;
  }

  public saveConfig(): void {
    try {
      this.createConfigDirectory();
      
      // Create a diff object with only non-default values
      const diff = this.createConfigDiff();
      
      fs.writeFileSync(this.configPath, TOML.stringify(diff as TOML.JsonMap));
      Logger.info(`Configuration saved to: ${this.configPath}`);
    } catch (error) {
      Logger.error('Failed to save configuration', { error });
      throw error;
    }
  }
  
  private createConfigDiff(): TOML.JsonMap {
    const { diff } = require('just-diff');
    
    const diffResult: TOML.JsonMap = {};
    
    // Handle non-array sections with just-diff
    const sections = ['logging', 'server', 'defaults', 'rate_limits', 'cache', 'model_routing'] as const;
    for (const section of sections) {
      const sectionDiff = diff(DEFAULT_CONFIG[section], this.config[section]);
      if (sectionDiff.length > 0) {
        diffResult[section] = this.config[section];
      }
    }
    
    // Handle models - just include all models as they differ from empty default
    if (this.config.models.length > 0) {
      diffResult.models = this.config.models as unknown as TOML.AnyJson;
    }
    
    return diffResult;
  }
  
  public getModelDefaults(): ModelConfig {
    return {
      id: '',
      display_name: '',
      provider: '',
      config: {
        base_url: '',
        api_key: '',
        model_name: ''
      }
    };
  }
  
  private getObjectDiff<T extends Record<string, unknown>>(defaultObj: T, currentObj: T): Partial<T> {
    const result: Partial<T> = {};

    for (const key in currentObj) {
      const currentVal = currentObj[key];
      const defaultVal = defaultObj[key];

      if (typeof currentVal === 'object' && currentVal !== null && 
          typeof defaultVal === 'object' && defaultVal !== null) {
        const nestedDiff = this.getObjectDiff(defaultVal as Record<string, unknown>, currentVal as Record<string, unknown>);
        if (Object.keys(nestedDiff).length > 0) {
          result[key] = nestedDiff as T[Extract<keyof T, string>];
        }
      } else if (currentVal !== defaultVal) {
        result[key] = currentVal;
      }
    }

    return result;
  }

  public updateConfig(newConfig: Config): void {
    this.config = newConfig;
  }
}