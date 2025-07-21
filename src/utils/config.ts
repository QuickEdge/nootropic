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
  }
};

export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;
  private configPath: string;

  private constructor(private allowEmpty: boolean = false) {
    this.configPath = path.join(os.homedir(), '.config', 'nootropic', 'config.toml');
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
        console.error('\n❌ No configuration file found!');
        console.error(`\n📝 Expected config file at: ${this.configPath}`);
        console.error('\n💡 Use the interactive config editor to create one:');
        console.error('   npm run config');
        console.error('\n🆘 Or create the file manually with:');
        console.error('   mkdir -p ~/.config/nootropic');
        console.error('   touch ~/.config/nootropic/config.toml');
        process.exit(1);
      }
    } catch (error) {
      console.error(`\n❌ Failed to load config from ${this.configPath}:`, error);
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

  public createEmptyConfig(): void {
    this.createConfigDirectory();
    const emptyConfig = {
      ...DEFAULT_CONFIG,
      models: [] // Ensure models array is empty
    };
    fs.writeFileSync(this.configPath, TOML.stringify(emptyConfig as any));
    console.log(`✅ Empty configuration created at: ${this.configPath}`);
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
      
      fs.writeFileSync(this.configPath, TOML.stringify(diff));
      console.log(`✅ Configuration saved to: ${this.configPath}`);
    } catch (error) {
      console.error(`❌ Failed to save configuration:`, error);
      throw error;
    }
  }
  
  private createConfigDiff(): any {
    const { diff } = require('just-diff');
    
    const diffResult: any = {};
    
    // Handle non-array sections with just-diff
    const sections = ['logging', 'server', 'defaults', 'rate_limits', 'cache'] as const;
    for (const section of sections) {
      const sectionDiff = diff(DEFAULT_CONFIG[section], this.config[section]);
      if (sectionDiff.length > 0) {
        diffResult[section] = this.config[section];
      }
    }
    
    // Handle models with custom diff for arrays
    if (this.config.models.length > 0) {
      diffResult.models = this.config.models.map(model => {
        return this.getObjectDiff(this.getModelDefaults(), model);
      });
    }
    
    return diffResult;
  }
  
  public getModelDefaults(): any {
    return {
      id: '',
      display_name: '',
      provider: '',
      config: {
        base_url: '',
        api_key: '',
        model_name: '',
        max_tokens: 4096,
        temperature_range: [0, 2] as [number, number],
        supports_streaming: true,
        supports_tools: true,
        supports_vision: false
      }
    };
  }
  
  private getObjectDiff<T extends Record<string, any>>(defaultObj: T, currentObj: T): Partial<T> {
    const result: any = {};

    for (const key in currentObj) {
      const currentVal = currentObj[key];
      const defaultVal = defaultObj[key];

      if (typeof currentVal === 'object' && currentVal !== null && 
          typeof defaultVal === 'object' && defaultVal !== null) {
        const nestedDiff = this.getObjectDiff(defaultVal, currentVal);
        if (Object.keys(nestedDiff).length > 0) {
          result[key] = nestedDiff;
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