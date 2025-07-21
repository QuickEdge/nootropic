import inquirer, { Question, Answers } from 'inquirer';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import TOML from '@iarna/toml';
import { Config, ModelConfig, ConfigManager } from '../utils/config';
import { prompts, PROVIDERS } from './prompts';

export class InteractiveConfigEditor {
  private config: Config;
  private configPath: string;

  constructor() {
    this.configPath = ConfigManager.getInstance(true).getConfigPath();
    this.config = ConfigManager.getInstance(true).getConfig();
  }

  async run(): Promise<void> {
    console.log(chalk.blue.bold('\n🚀 Nootropic Interactive Config Editor\n'));
    
    // Config is already loaded via ConfigManager in constructor
    const configManager = ConfigManager.getInstance(true);
    this.config = configManager.getConfig();
    
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
    const existingProviders = Array.from(new Set(this.config.models.map(m => m.provider)));

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
      prompts.maxTokens(),
      prompts.temperatureRange(),
      prompts.supportsStreaming(),
      prompts.supportsTools(),
      prompts.supportsVision(provider === 'openai' || provider === 'openrouter')
    ].filter(Boolean));

    // Pricing configuration
    const pricingAnswers = await inquirer.prompt(prompts.pricing());

    // Create model configuration
    const newModel: ModelConfig = {
      id: modelAnswers.id,
      display_name: modelAnswers.display_name,
      provider: provider === 'custom' ? 'custom' : provider,
      config: {
        base_url: modelAnswers.base_url || providerConfig.baseUrl,
        api_key: modelAnswers.api_key || existingApiKey || '',
        model_name: modelAnswers.model_name,
        max_tokens: parseInt(modelAnswers.max_tokens),
        temperature_range: modelAnswers.temperature_range.split(',').map((s: string) => parseFloat(s.trim())),
        supports_streaming: modelAnswers.supports_streaming,
        supports_tools: modelAnswers.supports_tools,
        supports_vision: modelAnswers.supports_vision
      }
    };

    if (pricingAnswers.has_pricing) {
      newModel.pricing = {
        input_per_1k: parseFloat(pricingAnswers.input_per_1k),
        output_per_1k: parseFloat(pricingAnswers.output_per_1k)
      };
    }

    this.config.models.push(newModel);

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

    const providerConfig = PROVIDERS[model.provider] || PROVIDERS.custom;
    const existingApiKey = model.config.api_key;

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
        default: model.config.base_url,
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
        default: model.config.model_name,
        validate: validators.isRequired
      },
      {
        type: 'input',
        name: 'max_tokens',
        message: '📊 Max tokens:',
        default: model.config.max_tokens.toString(),
        validate: validators.isValidNumber(1, 1000000)
      },
      {
        type: 'input',
        name: 'temperature_range',
        message: '🌡️  Temperature range (min, max):',
        default: model.config.temperature_range.join(', '),
        validate: validators.isValidTemperatureRange
      },
      {
        type: 'confirm',
        name: 'supports_streaming',
        message: '💬 Supports streaming?',
        default: model.config.supports_streaming
      },
      {
        type: 'confirm',
        name: 'supports_tools',
        message: '🛠️  Supports tools/functions?',
        default: model.config.supports_tools
      },
      {
        type: 'confirm',
        name: 'supports_vision',
        message: '👁️  Supports vision?',
        default: model.config.supports_vision
      }
    ]);

    // Update model
    this.config.models[modelIndex] = {
      ...model,
      display_name: updates.display_name,
      config: {
        ...model.config,
        base_url: updates.base_url,
        api_key: updates.api_key || model.config.api_key,
        model_name: updates.model_name,
        max_tokens: parseInt(updates.max_tokens),
        temperature_range: updates.temperature_range.split(',').map((s: string) => parseFloat(s.trim())),
        supports_streaming: updates.supports_streaming,
        supports_tools: updates.supports_tools,
        supports_vision: updates.supports_vision
      }
    };

    console.log(chalk.green(`\n✅ Model "${updates.display_name}" updated successfully!\n`));
    console.log(chalk.green(`\n✅ Model "${updates.display_name}" updated successfully!\n`));
  }

  private async removeModel(): Promise<void> {
    const config = this.configManager.getConfig();
    
    if (config.models.length === 0) {
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

  private viewConfig(): void {
    console.log(chalk.blue.bold('\n📋 Current Configuration\n'));
    console.log(chalk.cyan('Models:'));
    
    if (this.config.models.length === 0) {
      console.log(chalk.gray('  No models configured'));
    } else {
      this.config.models.forEach((model, index) => {
        console.log(chalk.white(`  ${index + 1}. ${model.display_name} (${model.id})`));
        console.log(chalk.gray(`     Provider: ${model.provider}`));
        console.log(chalk.gray(`     Model: ${model.config.model_name}`));
        console.log(chalk.gray(`     Base URL: ${model.config.base_url}`));
        console.log(chalk.gray(`     Max Tokens: ${model.config.max_tokens}`));
        console.log(chalk.gray(`     Streaming: ${model.config.supports_streaming ? '✅' : '❌'}`));
        console.log(chalk.gray(`     Tools: ${model.config.supports_tools ? '✅' : '❌'}`));
        console.log(chalk.gray(`     Vision: ${model.config.supports_vision ? '✅' : '❌'}`));
        if (model.pricing) {
          console.log(chalk.gray(`     Pricing: $${model.pricing.input_per_1k}/$${model.pricing.output_per_1k} per 1K tokens`));
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

// For backward compatibility with the original validator import
import { validators } from './validators';