import inquirer from 'inquirer';
import chalk from 'chalk';
import { Config, ModelConfig, ConfigManager } from '../utils/config';
import { prompts, PROVIDERS } from './prompts';
import { validators } from './validators';

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
    console.log(chalk.blue.bold('\n🚀 Nootropic Interactive Config Editor\n'));
    
    // Config is already loaded via ConfigManager in constructor
    const configManager = ConfigManager.getInstance(true);
    this.config = configManager.getConfig();
    
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
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
          console.log(chalk.yellow('\n👋 Goodbye!'));
          return;
        }
        console.error(chalk.red('\n❌ Error:'), error);
      }
    }
  }

  private async addModel(): Promise<void> {
    console.log(chalk.green('\n➕ Adding new model...\n'));

    const existingIds = this.config.models.map(m => m.id);

    // Select provider
    const { provider } = await inquirer.prompt(prompts.providerSelection());
    const providerConfig = PROVIDERS[provider];

    // Get existing API key for this provider if available
    const existingApiKey = this.findExistingApiKey(provider);

    // Model configuration
    const modelAnswers = await inquirer.prompt([
      prompts.modelId(existingIds),
      prompts.displayName(),
      provider === 'custom' ? prompts.baseUrl(providerConfig.baseUrl) : null,
      prompts.apiKey(providerConfig.name, existingApiKey),
      prompts.modelName(providerConfig.modelName),
      prompts.maxTokens()
    ].filter(Boolean));

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
        console.log(chalk.yellow(`⭐ Set as default model (first model added)\n`));
      } else {
        console.log(chalk.yellow(`⭐ Set as default model (no default was set)\n`));
      }
    }

    console.log(chalk.green(`\n✅ Model "${newModel.display_name}" added successfully!\n`));
  }

  private async editModel(): Promise<void> {
    if (this.config.models.length === 0) {
      console.log(chalk.yellow('\n⚠️  No models to edit.\n'));
      return;
    }

    const { modelId } = await inquirer.prompt(prompts.editModelSelection(this.config.models));
    const modelIndex = this.config.models.findIndex(m => m.id === modelId);
    const model = this.config.models[modelIndex];

    console.log(chalk.blue(`\n✏️  Editing model: ${model.display_name}\n`));


    const updates = await inquirer.prompt([
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
      },
      {
        type: 'input',
        name: 'max_tokens',
        message: '📊 Max tokens limit (0 for no limit):',
        default: (model.config?.max_tokens || 0).toString(),
        validate: (input: string | number) => {
          const num = typeof input === 'number' ? input : parseInt(String(input).trim(), 10);
          if (isNaN(num)) return 'Must be a valid number';
          if (num < 0) return 'Must be 0 or greater';
          if (num > 100000) return 'Must be less than 100,000';
          return true;
        },
        filter: (input: string | number) => {
          const num = typeof input === 'number' ? input : parseInt(String(input).trim(), 10);
          return (isNaN(num) || num === 0) ? undefined : num;
        }
      }
    ]);

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

    console.log(chalk.green(`\n✅ Model "${updates.display_name}" updated successfully!\n`));
  }

  private async removeModel(): Promise<void> {
    if (this.config.models.length === 0) {
      console.log(chalk.yellow('\n⚠️  No models to remove.\n'));
      return;
    }

    const { modelId } = await inquirer.prompt(prompts.removeModelSelection(this.config.models));
    const model = this.config.models.find(m => m.id === modelId)!;

    const { confirm } = await inquirer.prompt(prompts.confirmRemoval(model.display_name));
    
    if (confirm) {
      this.config.models = this.config.models.filter(m => m.id !== modelId);
      console.log(chalk.green(`\n✅ Model "${model.display_name}" removed successfully!\n`));
    } else {
 console.log(chalk.yellow('\n❌ Removal cancelled.\n'));
    }
  }

  private async setDefaultModel(): Promise<void> {
    if (this.config.models.length === 0) {
      console.log(chalk.yellow('\n⚠️  No models available to set as default.\n'));
      return;
    }

    const { modelId } = await inquirer.prompt(prompts.selectDefaultModel(this.config.models, this.config.model_routing?.default_model_id));
    if (!this.config.model_routing) {
      this.config.model_routing = {};
    }
    this.config.model_routing.default_model_id = modelId;
    
    const model = this.config.models.find(m => m.id === modelId);
    console.log(chalk.green(`\n✅ Default model set to: ${model?.display_name} (${modelId})\n`));
  }

  private viewConfig(): void {
    console.log(chalk.blue.bold('\n📋 Current Configuration\n'));
    console.log(chalk.cyan('Models:'));
    
    if (this.config.models.length === 0) {
      console.log(chalk.gray('  No models configured'));
    } else {
      this.config.models.forEach((model, index) => {
        const isDefault = model.id === this.config.model_routing?.default_model_id;
        console.log(chalk.white(`  ${index + 1}. ${model.display_name} (${model.id})${isDefault ? chalk.yellow(' ⭐ DEFAULT') : ''}`));
        console.log(chalk.gray(`     Provider: ${model.provider}`));
        console.log(chalk.gray(`     Model: ${model.config.model_name}`));
        console.log(chalk.gray(`     Base URL: ${model.config.base_url}`));
        if (model.config.max_tokens) {
          console.log(chalk.gray(`     Max Tokens: ${model.config.max_tokens}`));
        }
        console.log();
      });
    }
  }

  private async saveAndExit(): Promise<void> {
    const { save } = await inquirer.prompt(prompts.saveChanges());
    
    if (save) {
      try {
        const configManager = ConfigManager.getInstance(true);
        configManager.updateConfig(this.config);
        configManager.saveConfig();
        console.log(chalk.green('\n✅ Configuration saved successfully!\n'));
      } catch (error) {
        console.error(`❌ Failed to save configuration:`, error);
        throw error;
      }
    } else {
      console.log(chalk.yellow('\n❌ Changes discarded.\n'));
    }
  }

  private async exitWithoutSaving(): Promise<void> {
    // Check if config has any models (indicating changes)
    const configManager = ConfigManager.getInstance(true);
    const originalConfig = configManager.getConfig();
    const hasChanges = this.config.models.length !== originalConfig.models.length ||
                      JSON.stringify(this.config.models) !== JSON.stringify(originalConfig.models);

    if (hasChanges) {
      console.log(chalk.yellow('\n⚠️  You have unsaved changes!\n'));
      const { save } = await inquirer.prompt(prompts.saveChanges());
      if (save) {
        try {
          configManager.updateConfig(this.config);
          configManager.saveConfig();
          console.log(chalk.green('\n✅ Configuration saved successfully!\n'));
        } catch (error) {
          console.error(`❌ Failed to save configuration:`, error);
          throw error;
        }
      }
    }
  }


  private findExistingApiKey(provider: string): string | undefined {
    const providerModel = this.config.models.find(m => m.provider === provider);
    return providerModel?.config.api_key;
  }
}