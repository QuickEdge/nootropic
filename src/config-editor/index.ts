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
        default_model_display_name: undefined
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

    const existingDisplayNames = this.config.models.map(m => m.display_name);

    // Select provider
    const { provider } = await inquirer.prompt(prompts.providerSelection());
    const providerConfig = PROVIDERS[provider];

    // Get existing API key for this provider if available
    const existingApiKey = this.findExistingApiKey(provider);

    // First get the model name
    const { model_name } = await inquirer.prompt([
      prompts.modelName(providerConfig.modelName)
    ]);

    // Generate default display name from model name
    const defaultDisplayName = this.generateDisplayNameFromModelName(model_name);

    // Model configuration
    const basicAnswers = await inquirer.prompt([
      prompts.displayName(existingDisplayNames, defaultDisplayName),
      provider === 'custom' ? prompts.baseUrl(providerConfig.baseUrl) : null,
      prompts.apiKey(providerConfig.name, existingApiKey)
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
      model_name,
      max_tokens: maxTokens === 0 ? undefined : maxTokens
    } as typeof basicAnswers & { model_name: string; max_tokens: number | undefined };

    // Create model configuration
    const newModel: ModelConfig = {
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
    if (this.config.models.length === 1 || !this.config.model_routing?.default_model_display_name) {
      if (!this.config.model_routing) {
        this.config.model_routing = {};
      }
      this.config.model_routing.default_model_display_name = newModel.display_name;
      if (this.config.models.length === 1) {
        Logger.info('Set first model as default', { displayName: newModel.display_name });
        Logger.info('⭐ Set as default model (first model added)');
      } else {
        Logger.info('Set model as default (no default was set)', { displayName: newModel.display_name });
        Logger.info('⭐ Set as default model (no default was set)');
      }
    }

    Logger.info('Model added successfully', { displayName: newModel.display_name, provider: newModel.provider });
    Logger.info(`✅ Model "${newModel.display_name}" added successfully!`);
  }

  private async editModel(): Promise<void> {
    if (this.config.models.length === 0) {
      Logger.warn('No models available to edit');
      Logger.warn('⚠️  No models to edit.');
      return;
    }

    const { displayName } = await inquirer.prompt(prompts.editModelSelection(this.config.models));
    const modelIndex = this.config.models.findIndex(m => m.display_name === displayName);
    const model = this.config.models[modelIndex];

    Logger.info(`✏️  Editing model: ${model.display_name}`);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Display current settings
      Logger.info('');
      Logger.info('📋 Current settings:');
      Logger.info(`  📝 Display Name: ${model.display_name}`);
      Logger.info(`  🔗 Base URL: ${model.config?.base_url || 'Not set'}`);
      Logger.info(`  🔑 API Key: ${model.config?.api_key ? '***' + model.config.api_key.slice(-4) : 'Not set'}`);
      Logger.info(`  🤖 Model Name: ${model.config?.model_name || 'Not set'}`);
      Logger.info(`  📊 Max Tokens: ${model.config?.max_tokens || 'No limit'}`);
      Logger.info('');
      const { field } = await inquirer.prompt([{
        type: 'list',
        name: 'field',
        message: '📋 What would you like to edit?',
        choices: [
          { name: '📝 Display Name', value: 'display_name' },
          { name: '🔗 Base URL', value: 'base_url' },
          { name: '🔑 API Key', value: 'api_key' },
          { name: '🤖 Model Name', value: 'model_name' },
          { name: '📊 Max Tokens', value: 'max_tokens' },
          new inquirer.Separator(),
          { name: '← Back to Model Menu', value: 'back' }
        ]
      }]);

      if (field === 'back') {
        break;
      }

      switch (field) {
        case 'display_name': {
          const { display_name } = await inquirer.prompt([{
            type: 'input',
            name: 'display_name',
            message: '📝 Display name:',
            default: model.display_name,
            validate: validators.isRequired
          }]);
          this.config.models[modelIndex].display_name = display_name;
          model.display_name = display_name;
          Logger.info(`✅ Display name updated to: ${display_name}`);
          break;
        }
        
        case 'base_url': {
          const { base_url } = await inquirer.prompt([{
            type: 'input',
            name: 'base_url',
            message: '🔗 Base URL:',
            default: model.config?.base_url || '',
            validate: validators.isValidUrl
          }]);
          if (!this.config.models[modelIndex].config) {
            this.config.models[modelIndex].config = {
              base_url: '',
              api_key: '',
              model_name: ''
            };
          }
          this.config.models[modelIndex].config.base_url = base_url;
          model.config.base_url = base_url;
          Logger.info(`✅ Base URL updated to: ${base_url}`);
          break;
        }
        
        case 'api_key': {
          const { api_key } = await inquirer.prompt([{
            type: 'password',
            name: 'api_key',
            message: '🔑 API key (leave empty to keep current):',
            mask: '*',
            validate: (input: string) => {
              if (!input) return true;
              return validators.isValidApiKey(input);
            }
          }]);
          if (api_key) {
            if (!this.config.models[modelIndex].config) {
              this.config.models[modelIndex].config = {
              base_url: '',
              api_key: '',
              model_name: ''
            };
            }
            this.config.models[modelIndex].config.api_key = api_key;
            model.config.api_key = api_key;
            Logger.info('✅ API key updated');
          } else {
            Logger.info('ℹ️  API key unchanged');
          }
          break;
        }
        
        case 'model_name': {
          const { model_name } = await inquirer.prompt([{
            type: 'input',
            name: 'model_name',
            message: '🤖 Model name:',
            default: model.config?.model_name || '',
            validate: validators.isRequired
          }]);
          if (!this.config.models[modelIndex].config) {
            this.config.models[modelIndex].config = {
              base_url: '',
              api_key: '',
              model_name: ''
            };
          }
          this.config.models[modelIndex].config.model_name = model_name;
          model.config.model_name = model_name;
          Logger.info(`✅ Model name updated to: ${model_name}`);
          break;
        }
        
        case 'max_tokens': {
          const maxTokens = await numberPrompt({
            message: '📊 Max tokens limit (0 for no limit):',
            default: model.config?.max_tokens || 0,
            min: 0,
            max: 100000
          });
          if (!this.config.models[modelIndex].config) {
            this.config.models[modelIndex].config = {
              base_url: '',
              api_key: '',
              model_name: ''
            };
          }
          this.config.models[modelIndex].config.max_tokens = maxTokens === 0 ? undefined : maxTokens;
          model.config.max_tokens = maxTokens === 0 ? undefined : maxTokens;
          Logger.info(`✅ Max tokens updated to: ${maxTokens === 0 ? 'No limit' : maxTokens}`);
          break;
        }
      }
    }

    Logger.info('Model updated successfully', { displayName: model.display_name });
    Logger.info(`✅ Model "${model.display_name}" editing complete!`);
  }

  private async removeModel(): Promise<void> {
    if (this.config.models.length === 0) {
      Logger.warn('No models available to remove');
      Logger.warn('⚠️  No models to remove.');
      return;
    }

    const { displayName } = await inquirer.prompt(prompts.removeModelSelection(this.config.models));
    const model = this.config.models.find(m => m.display_name === displayName)!;

    const { confirm } = await inquirer.prompt(prompts.confirmRemoval(model.display_name));
    
    if (confirm) {
      this.config.models = this.config.models.filter(m => m.display_name !== displayName);
      Logger.info('Model removed successfully', { displayName: model.display_name });
      Logger.info(`✅ Model "${model.display_name}" removed successfully!`);
    } else {
      Logger.info('Model removal cancelled', { displayName: model.display_name });
      Logger.info('❌ Removal cancelled.');
    }
  }

  private async setDefaultModel(): Promise<void> {
    if (this.config.models.length === 0) {
      Logger.warn('No models available to set as default');
      Logger.warn('⚠️  No models available to set as default.');
      return;
    }

    const { displayName } = await inquirer.prompt(prompts.selectDefaultModel(this.config.models, this.config.model_routing?.default_model_display_name));
    if (!this.config.model_routing) {
      this.config.model_routing = {};
    }
    this.config.model_routing.default_model_display_name = displayName;
    
    const model = this.config.models.find(m => m.display_name === displayName);
    Logger.info('Default model updated', { displayName: model?.display_name });
    Logger.info(`✅ Default model set to: ${model?.display_name}`);
  }

  private viewModels(): void {
    Logger.info('🤖 Models Configuration');
    
    if (this.config.models.length === 0) {
      Logger.info('  No models configured');
    } else {
      this.config.models.forEach((model, index) => {
        const isDefault = model.display_name === this.config.model_routing?.default_model_display_name;
        Logger.info(`  ${index + 1}. ${model.display_name}${isDefault ? ' ⭐ DEFAULT' : ''}`);
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
        const isDefault = model.display_name === this.config.model_routing?.default_model_display_name;
        Logger.info(`  ${index + 1}. ${model.display_name}${isDefault ? ' ⭐ DEFAULT' : ''}`);
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
    Logger.info(`  Default Model: ${this.config.model_routing?.default_model_display_name || 'Not set'}`);
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

  private generateDisplayNameFromModelName(modelName: string): string {
    // If model name contains '/', use everything after the last '/'
    if (modelName.includes('/')) {
      return modelName.split('/').pop() || modelName;
    }
    // Otherwise use the full model name
    return modelName;
  }

  private async editServerSettings(): Promise<void> {
    Logger.info('⚙️  Editing Server Settings');
    
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Display current settings
      Logger.info('');
      Logger.info('📋 Current settings:');
      Logger.info(`  🌐 Host: ${this.config.server.host}`);
      Logger.info(`  🔌 Port: ${this.config.server.port}`);
      Logger.info(`  🔒 CORS: ${this.config.server.cors.enabled ? 'Enabled' : 'Disabled'}`);
      if (this.config.server.cors.enabled) {
        Logger.info(`  🌍 Allowed Origins: ${this.config.server.cors.origins.join(', ')}`);
      }
      Logger.info('');

      const { field } = await inquirer.prompt([{
        type: 'list',
        name: 'field',
        message: '📋 What would you like to edit?',
        choices: [
          { name: '🌐 Host', value: 'host' },
          { name: '🔌 Port', value: 'port' },
          { name: '🔒 CORS Settings', value: 'cors' },
          new inquirer.Separator(),
          { name: '← Back to Main Menu', value: 'back' }
        ]
      }]);

      if (field === 'back') {
        break;
      }

      switch (field) {
        case 'host': {
          const { host } = await inquirer.prompt([{
            type: 'input',
            name: 'host',
            message: '🌐 Host:',
            default: this.config.server.host,
            validate: validators.isRequired
          }]);
          this.config.server.host = host;
          Logger.info(`✅ Host updated to: ${host}`);
          break;
        }

        case 'port': {
          const port = await numberPrompt({
            message: '🔌 Port:',
            default: this.config.server.port,
            min: 1,
            max: 65535
          });
          this.config.server.port = port || 3000;
          Logger.info(`✅ Port updated to: ${port}`);
          break;
        }

        case 'cors': {
          const { cors_enabled } = await inquirer.prompt([{
            type: 'confirm',
            name: 'cors_enabled',
            message: '🔒 Enable CORS?',
            default: this.config.server.cors.enabled
          }]);
          this.config.server.cors.enabled = cors_enabled;

          if (cors_enabled) {
            const { origins } = await inquirer.prompt([{
              type: 'input',
              name: 'origins',
              message: '🌍 Allowed origins (comma-separated):',
              default: this.config.server.cors.origins.join(', '),
              filter: (input: string) => input.split(',').map(o => o.trim()).filter(o => o)
            }]);
            this.config.server.cors.origins = origins;
            Logger.info(`✅ CORS enabled with origins: ${origins.join(', ')}`);
          } else {
            Logger.info('✅ CORS disabled');
          }
          break;
        }
      }
    }
  }

  private async editLogging(): Promise<void> {
    Logger.info('📋 Editing Logging Settings');
    
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Display current settings
      Logger.info('');
      Logger.info('📋 Current settings:');
      Logger.info(`  📝 Enabled: ${this.config.logging.enabled ? 'Yes' : 'No'}`);
      Logger.info(`  🎚️  Level: ${this.config.logging.level}`);
      Logger.info(`  📄 Format: ${this.config.logging.format}`);
      Logger.info('');

      const { field } = await inquirer.prompt([{
        type: 'list',
        name: 'field',
        message: '📋 What would you like to edit?',
        choices: [
          { name: '📝 Enable/Disable Logging', value: 'enabled' },
          { name: '🎚️  Log Level', value: 'level' },
          { name: '📄 Log Format', value: 'format' },
          new inquirer.Separator(),
          { name: '← Back to Main Menu', value: 'back' }
        ]
      }]);

      if (field === 'back') {
        break;
      }

      switch (field) {
        case 'enabled': {
          const { enabled } = await inquirer.prompt([{
            type: 'confirm',
            name: 'enabled',
            message: '📝 Enable logging?',
            default: this.config.logging.enabled
          }]);
          this.config.logging.enabled = enabled;
          Logger.info(`✅ Logging ${enabled ? 'enabled' : 'disabled'}`);
          break;
        }

        case 'level': {
          const { level } = await inquirer.prompt([{
            type: 'list',
            name: 'level',
            message: '🎚️  Log level:',
            choices: ['debug', 'info', 'warn', 'error'],
            default: this.config.logging.level
          }]);
          this.config.logging.level = level;
          Logger.info(`✅ Log level set to: ${level}`);
          break;
        }

        case 'format': {
          const { format } = await inquirer.prompt([{
            type: 'list',
            name: 'format',
            message: '📄 Log format:',
            choices: ['json', 'text'],
            default: this.config.logging.format
          }]);
          this.config.logging.format = format;
          Logger.info(`✅ Log format set to: ${format}`);
          break;
        }
      }
    }
  }

  private async editDefaults(): Promise<void> {
    Logger.info('🎨 Editing Default Settings');
    
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Display current settings
      Logger.info('');
      Logger.info('📋 Current settings:');
      Logger.info(`  🤖 Model: ${this.config.defaults.model || 'Not set'}`);
      Logger.info(`  📊 Max Tokens: ${this.config.defaults.max_tokens}`);
      Logger.info(`  🌡️  Temperature: ${this.config.defaults.temperature}`);
      Logger.info(`  🌊 Stream: ${this.config.defaults.stream ? 'Yes' : 'No'}`);
      Logger.info('');

      const { field } = await inquirer.prompt([{
        type: 'list',
        name: 'field',
        message: '📋 What would you like to edit?',
        choices: [
          { name: '📊 Max Tokens', value: 'max_tokens' },
          { name: '🌡️  Temperature', value: 'temperature' },
          { name: '🌊 Streaming', value: 'stream' },
          new inquirer.Separator(),
          { name: '← Back to Main Menu', value: 'back' }
        ]
      }]);

      if (field === 'back') {
        break;
      }

      switch (field) {
        case 'max_tokens': {
          const maxTokens = await numberPrompt({
            message: '📊 Default max tokens:',
            default: this.config.defaults.max_tokens,
            min: 1,
            max: 100000
          });
          this.config.defaults.max_tokens = maxTokens || 4096;
          Logger.info(`✅ Max tokens set to: ${maxTokens}`);
          break;
        }

        case 'temperature': {
          const temperature = await numberPrompt({
            message: '🌡️  Default temperature:',
            default: this.config.defaults.temperature,
            min: 0,
            max: 2,
            step: 0.1
          });
          this.config.defaults.temperature = temperature || 0.7;
          Logger.info(`✅ Temperature set to: ${temperature}`);
          break;
        }

        case 'stream': {
          const { stream } = await inquirer.prompt([{
            type: 'confirm',
            name: 'stream',
            message: '🌊 Default to streaming?',
            default: this.config.defaults.stream
          }]);
          this.config.defaults.stream = stream;
          Logger.info(`✅ Streaming ${stream ? 'enabled' : 'disabled'} by default`);
          break;
        }
      }
    }
  }


  private async editModelRouting(): Promise<void> {
    Logger.info('🔄 Editing Model Routing');
    
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Display current settings
      Logger.info('');
      Logger.info('📋 Current settings:');
      Logger.info(`  🎯 Default Model: ${this.config.model_routing?.default_model_display_name || 'Not set'}`);
      Logger.info(`  🔀 Route Claude models to default: ${this.config.model_routing?.route_claude_models_to_default ? 'Yes' : 'No'}`);
      Logger.info('');

      const { field } = await inquirer.prompt([{
        type: 'list',
        name: 'field',
        message: '📋 What would you like to edit?',
        choices: [
          { name: '🎯 Default Model', value: 'default_model' },
          { name: '🔀 Claude Model Routing', value: 'route_claude' },
          new inquirer.Separator(),
          { name: '← Back to Main Menu', value: 'back' }
        ]
      }]);

      if (field === 'back') {
        break;
      }

      switch (field) {
        case 'default_model': {
          if (this.config.models.length === 0) {
            Logger.warn('⚠️  No models available to set as default.');
          } else {
            const { displayName } = await inquirer.prompt(prompts.selectDefaultModel(this.config.models, this.config.model_routing?.default_model_display_name));
            if (!this.config.model_routing) {
              this.config.model_routing = {};
            }
            this.config.model_routing.default_model_display_name = displayName;
            Logger.info(`✅ Default model set to: ${displayName}`);
          }
          break;
        }

        case 'route_claude': {
          const { route_claude_models } = await inquirer.prompt([{
            type: 'confirm',
            name: 'route_claude_models',
            message: '🔀 Route Claude model requests to default model?',
            default: this.config.model_routing?.route_claude_models_to_default ?? true
          }]);
          if (!this.config.model_routing) {
            this.config.model_routing = {};
          }
          this.config.model_routing.route_claude_models_to_default = route_claude_models;
          Logger.info(`✅ Claude model routing ${route_claude_models ? 'enabled' : 'disabled'}`);
          break;
        }
      }
    }
  }
}