import inquirer from 'inquirer';
import numberPrompt from '@inquirer/number';
import { Config, ModelConfig, ConfigManager } from '../utils/config';
import { prompts, PROVIDERS } from './prompts';
import { validators } from './validators';
import Logger from '../utils/logger';

export class InteractiveConfigEditor {
  private config: Config;
  private configPath: string;

  constructor() {
    this.configPath = ConfigManager.getInstance(true).getConfigPath();
    this.config = ConfigManager.getInstance(true).getConfig();
    
    // Ensure model_routing section exists
    if (!this.config.model_routing) {
      this.config.model_routing = {
        default_model_id: undefined
      };
    }
  }

  async run(): Promise<void> {
    Logger.info('🚀 Nootropic Interactive Config Editor');
    
    // Config is already loaded via ConfigManager in constructor
    const configManager = ConfigManager.getInstance(true);
    this.config = configManager.getConfig();
    
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const { action } = await inquirer.prompt([{
          type: 'list',
          name: 'action',
          message: '🎯 What would you like to configure?',
          choices: [
            { name: '🤖 Models', value: 'models' },
            { name: '⚙️  Server Settings', value: 'server' },
            { name: '📋 Logging', value: 'logging' },
            { name: '🎨 Defaults', value: 'defaults' },
            { name: '🔄 Model Routing', value: 'model_routing' },
            new inquirer.Separator(),
            { name: '👁️  View All Config', value: 'view' },
            { name: '💾 Save & Exit', value: 'save' },
            { name: '❌ Exit Without Saving', value: 'exit' }
          ],
          pageSize: 10
        }]);
        
        switch (action) {
          case 'models':
            await this.editModels();
            break;
          case 'server':
            await this.editServerSettings();
            break;
          case 'logging':
            await this.editLogging();
            break;
          case 'defaults':
            await this.editDefaults();
            break;
          case 'model_routing':
            await this.editModelRouting();
            break;
          case 'view':
            this.viewConfig();
            break;
          case 'save':
            await this.saveAndExit();
            return;
          case 'exit':
            await this.exitWithoutSaving();
            return;
        }
      } catch (error) {
        if (error === 'exit') {
          Logger.info('Config editor exiting - Goodbye! 👋');
          return;
        }
        Logger.error('Config editor error', { error });
        Logger.error('Config editor operation failed', { error });
      }
    }
  }

  private async editModels(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { action } = await inquirer.prompt(prompts.mainMenu());
      
      switch (action) {
        case 'add':
          await this.addModel();
          break;
        case 'edit':
          await this.editModel();
          break;
        case 'remove':
          await this.removeModel();
          break;
        case 'setDefault':
          await this.setDefaultModel();
          break;
        case 'view':
          this.viewModels();
          break;
        case 'back':
          return;
      }
    }
  }

  private async addModel(): Promise<void> {
    Logger.info('➕ Adding new model...');

    const existingIds = this.config.models.map(m => m.id);

    // Select provider
    const { provider } = await inquirer.prompt(prompts.providerSelection());
    const providerConfig = PROVIDERS[provider];

    // Get existing API key for this provider if available
    const existingApiKey = this.findExistingApiKey(provider);

    // Model configuration
    const basicAnswers = await inquirer.prompt([
      prompts.modelId(existingIds),
      prompts.displayName(),
      provider === 'custom' ? prompts.baseUrl(providerConfig.baseUrl) : null,
      prompts.apiKey(providerConfig.name, existingApiKey),
      prompts.modelName(providerConfig.modelName)
    ].filter(Boolean));

    // Use dedicated number prompt for max_tokens
    const maxTokens = await numberPrompt({
      message: '📊 Max tokens limit (0 for no limit):',
      default: 0,
      min: 0,
      max: 100000
    });

    const modelAnswers = {
      ...basicAnswers,
      max_tokens: maxTokens === 0 ? undefined : maxTokens
    } as typeof basicAnswers & { max_tokens: number | undefined };

    // Create model configuration
    const newModel: ModelConfig = {
      id: modelAnswers.id,
      display_name: modelAnswers.display_name,
      provider: provider === 'custom' ? 'custom' : provider,
      config: {
        base_url: modelAnswers.base_url || providerConfig.baseUrl,
        api_key: modelAnswers.api_key || existingApiKey || '',
        model_name: modelAnswers.model_name,
        max_tokens: modelAnswers.max_tokens
      }
    };

    this.config.models.push(newModel);

    // If this is the first model, or no default is set, set it as default
    if (this.config.models.length === 1 || !this.config.model_routing?.default_model_id) {
      if (!this.config.model_routing) {
        this.config.model_routing = {};
      }
      this.config.model_routing.default_model_id = newModel.id;
      if (this.config.models.length === 1) {
        Logger.info('Set first model as default', { modelId: newModel.id, displayName: newModel.display_name });
        Logger.info('⭐ Set as default model (first model added)');
      } else {
        Logger.info('Set model as default (no default was set)', { modelId: newModel.id, displayName: newModel.display_name });
        Logger.info('⭐ Set as default model (no default was set)');
      }
    }

    Logger.info('Model added successfully', { modelId: newModel.id, displayName: newModel.display_name, provider: newModel.provider });
    Logger.info(`✅ Model "${newModel.display_name}" added successfully!`);
  }

  private async editModel(): Promise<void> {
    if (this.config.models.length === 0) {
      Logger.warn('No models available to edit');
      Logger.warn('⚠️  No models to edit.');
      return;
    }

    const { modelId } = await inquirer.prompt(prompts.editModelSelection(this.config.models));
    const modelIndex = this.config.models.findIndex(m => m.id === modelId);
    const model = this.config.models[modelIndex];

    Logger.info(`✏️  Editing model: ${model.display_name}`);


    const basicUpdates = await inquirer.prompt([
      {
        type: 'input',
        name: 'display_name',
        message: '📝 Display name:',
        default: model.display_name,
        validate: validators.isRequired
      },
      {
        type: 'input',
        name: 'base_url',
        message: '🔗 Base URL:',
        default: model.config?.base_url || '',
        validate: validators.isValidUrl
      },
      {
        type: 'password',
        name: 'api_key',
        message: '🔑 API key (leave empty to keep current):',
        mask: '*',
        validate: (input: string) => {
          if (!input) return true;
          return validators.isValidApiKey(input);
        }
      },
      {
        type: 'input',
        name: 'model_name',
        message: '🤖 Model name:',
        default: model.config?.model_name || '',
        validate: validators.isRequired
      }
    ]);

    // Use dedicated number prompt for max_tokens
    const maxTokens = await numberPrompt({
      message: '📊 Max tokens limit (0 for no limit):',
      default: model.config?.max_tokens || 0,
      min: 0,
      max: 100000
    });

    const updates = {
      ...basicUpdates,
      max_tokens: maxTokens === 0 ? undefined : maxTokens
    } as typeof basicUpdates & { max_tokens: number | undefined };

    // No need to handle default model here anymore

    // Update model
    this.config.models[modelIndex] = {
      ...model,
      display_name: updates.display_name,
      config: {
        ...model.config,
        base_url: updates.base_url,
        api_key: updates.api_key || model.config?.api_key || '',
        model_name: updates.model_name,
        max_tokens: updates.max_tokens
      }
    };

    Logger.info('Model updated successfully', { modelId: modelId, displayName: updates.display_name });
    Logger.info(`✅ Model "${updates.display_name}" updated successfully!`);
  }

  private async removeModel(): Promise<void> {
    if (this.config.models.length === 0) {
      Logger.warn('No models available to remove');
      Logger.warn('⚠️  No models to remove.');
      return;
    }

    const { modelId } = await inquirer.prompt(prompts.removeModelSelection(this.config.models));
    const model = this.config.models.find(m => m.id === modelId)!;

    const { confirm } = await inquirer.prompt(prompts.confirmRemoval(model.display_name));
    
    if (confirm) {
      this.config.models = this.config.models.filter(m => m.id !== modelId);
      Logger.info('Model removed successfully', { modelId, displayName: model.display_name });
      Logger.info(`✅ Model "${model.display_name}" removed successfully!`);
    } else {
      Logger.info('Model removal cancelled', { modelId, displayName: model.display_name });
      Logger.info('❌ Removal cancelled.');
    }
  }

  private async setDefaultModel(): Promise<void> {
    if (this.config.models.length === 0) {
      Logger.warn('No models available to set as default');
      Logger.warn('⚠️  No models available to set as default.');
      return;
    }

    const { modelId } = await inquirer.prompt(prompts.selectDefaultModel(this.config.models, this.config.model_routing?.default_model_id));
    if (!this.config.model_routing) {
      this.config.model_routing = {};
    }
    this.config.model_routing.default_model_id = modelId;
    
    const model = this.config.models.find(m => m.id === modelId);
    Logger.info('Default model updated', { modelId, displayName: model?.display_name });
    Logger.info(`✅ Default model set to: ${model?.display_name} (${modelId})`);
  }

  private viewModels(): void {
    Logger.info('🤖 Models Configuration');
    
    if (this.config.models.length === 0) {
      Logger.info('  No models configured');
    } else {
      this.config.models.forEach((model, index) => {
        const isDefault = model.id === this.config.model_routing?.default_model_id;
        Logger.info(`  ${index + 1}. ${model.display_name} (${model.id})${isDefault ? ' ⭐ DEFAULT' : ''}`);
        Logger.info(`     Provider: ${model.provider}`);
        Logger.info(`     Model: ${model.config.model_name}`);
        Logger.info(`     Base URL: ${model.config.base_url}`);
        if (model.config.max_tokens) {
          Logger.info(`     Max Tokens: ${model.config.max_tokens}`);
        }
        Logger.info('');
      });
    }
  }

  private viewConfig(): void {
    Logger.info('📋 Current Configuration');
    Logger.info('');
    
    Logger.info('🤖 Models:');
    if (this.config.models.length === 0) {
      Logger.info('  No models configured');
    } else {
      this.config.models.forEach((model, index) => {
        const isDefault = model.id === this.config.model_routing?.default_model_id;
        Logger.info(`  ${index + 1}. ${model.display_name} (${model.id})${isDefault ? ' ⭐ DEFAULT' : ''}`);
      });
    }
    Logger.info('');
    
    Logger.info('⚙️  Server:');
    Logger.info(`  Host: ${this.config.server.host}`);
    Logger.info(`  Port: ${this.config.server.port}`);
    Logger.info(`  CORS: ${this.config.server.cors.enabled ? 'Enabled' : 'Disabled'}`);
    if (this.config.server.cors.enabled) {
      Logger.info(`  Allowed Origins: ${this.config.server.cors.origins.join(', ')}`);
    }
    Logger.info('');
    
    Logger.info('📋 Logging:');
    Logger.info(`  Enabled: ${this.config.logging.enabled ? 'Yes' : 'No'}`);
    Logger.info(`  Level: ${this.config.logging.level}`);
    Logger.info(`  Format: ${this.config.logging.format}`);
    Logger.info('');
    
    Logger.info('🎨 Defaults:');
    Logger.info(`  Model: ${this.config.defaults.model || 'Not set'}`);
    Logger.info(`  Max Tokens: ${this.config.defaults.max_tokens}`);
    Logger.info(`  Temperature: ${this.config.defaults.temperature}`);
    Logger.info(`  Stream: ${this.config.defaults.stream ? 'Yes' : 'No'}`);
    Logger.info('');
    
    Logger.info('🔄 Model Routing:');
    Logger.info(`  Default Model: ${this.config.model_routing?.default_model_id || 'Not set'}`);
    Logger.info(`  Route Claude models to default: ${this.config.model_routing?.route_claude_models_to_default ? 'Yes' : 'No'}`);
    Logger.info('');
  }

  private async saveAndExit(): Promise<void> {
    const { save } = await inquirer.prompt(prompts.saveChanges());
    
    if (save) {
      try {
        const configManager = ConfigManager.getInstance(true);
        configManager.updateConfig(this.config);
        configManager.saveConfig();
        Logger.info('Configuration saved successfully', { configPath: this.configPath });
        Logger.info('✅ Configuration saved successfully!');
      } catch (error) {
        Logger.error('Failed to save configuration', { error, configPath: this.configPath });
        Logger.error('❌ Failed to save configuration:', { error });
        throw error;
      }
    } else {
      Logger.info('Configuration changes discarded');
      Logger.info('❌ Changes discarded.');
    }
  }

  private async exitWithoutSaving(): Promise<void> {
    // Check if config has any models (indicating changes)
    const configManager = ConfigManager.getInstance(true);
    const originalConfig = configManager.getConfig();
    const hasChanges = this.config.models.length !== originalConfig.models.length ||
                      JSON.stringify(this.config.models) !== JSON.stringify(originalConfig.models);

    if (hasChanges) {
      Logger.warn('Exiting with unsaved changes');
      Logger.warn('⚠️  You have unsaved changes!');
      const { save } = await inquirer.prompt(prompts.saveChanges());
      if (save) {
        try {
          configManager.updateConfig(this.config);
          configManager.saveConfig();
          Logger.info('Configuration saved on exit', { configPath: this.configPath });
          Logger.info('✅ Configuration saved successfully!');
        } catch (error) {
          Logger.error('Failed to save configuration on exit', { error, configPath: this.configPath });
          Logger.error('❌ Failed to save configuration:', { error });
          throw error;
        }
      }
    }
  }


  private findExistingApiKey(provider: string): string | undefined {
    const providerModel = this.config.models.find(m => m.provider === provider);
    return providerModel?.config.api_key;
  }

  private async editServerSettings(): Promise<void> {
    Logger.info('⚙️  Editing Server Settings');
    
    const updates = await inquirer.prompt([
      {
        type: 'input',
        name: 'host',
        message: '🌐 Host:',
        default: this.config.server.host,
        validate: validators.isRequired
      },
      {
        type: 'number',
        name: 'port',
        message: '🔌 Port:',
        default: this.config.server.port,
        validate: (input: number) => {
          if (input < 1 || input > 65535) {
            return 'Port must be between 1 and 65535';
          }
          return true;
        }
      },
      {
        type: 'confirm',
        name: 'cors_enabled',
        message: '🔒 Enable CORS?',
        default: this.config.server.cors.enabled
      }
    ]);

    this.config.server.host = updates.host;
    this.config.server.port = updates.port;
    this.config.server.cors.enabled = updates.cors_enabled;

    if (updates.cors_enabled) {
      const { origins } = await inquirer.prompt([
        {
          type: 'input',
          name: 'origins',
          message: '🌍 Allowed origins (comma-separated):',
          default: this.config.server.cors.origins.join(', '),
          filter: (input: string) => input.split(',').map(o => o.trim()).filter(o => o)
        }
      ]);
      this.config.server.cors.origins = origins;
    }

    Logger.info('✅ Server settings updated!');
  }

  private async editLogging(): Promise<void> {
    Logger.info('📋 Editing Logging Settings');
    
    const updates = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enabled',
        message: '📝 Enable logging?',
        default: this.config.logging.enabled
      },
      {
        type: 'list',
        name: 'level',
        message: '🎚️  Log level:',
        choices: ['debug', 'info', 'warn', 'error'],
        default: this.config.logging.level
      },
      {
        type: 'list',
        name: 'format',
        message: '📄 Log format:',
        choices: ['json', 'text'],
        default: this.config.logging.format
      }
    ]);

    this.config.logging = updates;
    Logger.info('✅ Logging settings updated!');
  }

  private async editDefaults(): Promise<void> {
    Logger.info('🎨 Editing Default Settings');
    
    const maxTokens = await numberPrompt({
      message: '📊 Default max tokens:',
      default: this.config.defaults.max_tokens,
      min: 1,
      max: 100000
    });

    const temperature = await numberPrompt({
      message: '🌡️  Default temperature:',
      default: this.config.defaults.temperature,
      min: 0,
      max: 2,
      step: 0.1
    });

    const stream = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'stream',
        message: '🌊 Default to streaming?',
        default: this.config.defaults.stream
      }
    ]);

    this.config.defaults.max_tokens = maxTokens || 4096;
    this.config.defaults.temperature = temperature || 0.7;
    this.config.defaults.stream = stream.stream;

    Logger.info('✅ Default settings updated!');
  }


  private async editModelRouting(): Promise<void> {
    Logger.info('🔄 Editing Model Routing');
    
    const { route_claude_models } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'route_claude_models',
        message: '🔀 Route Claude model requests to default model?',
        default: this.config.model_routing?.route_claude_models_to_default ?? true
      }
    ]);

    if (!this.config.model_routing) {
      this.config.model_routing = {};
    }
    this.config.model_routing.route_claude_models_to_default = route_claude_models;

    Logger.info('✅ Model routing updated!');
  }
}