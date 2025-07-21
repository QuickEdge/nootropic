import { validators } from './validators';
import { ListQuestion, InputQuestion, PasswordQuestion, ConfirmQuestion } from 'inquirer';

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  modelName: string;
  apiKeyPrefix?: string;
}

export const PROVIDERS: Record<string, ProviderConfig> = {
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelName: 'anthropic/claude-3.5-sonnet',
    apiKeyPrefix: 'sk-or-'
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelName: 'llama-3.1-70b-versatile',
    apiKeyPrefix: 'gsk_'
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    modelName: 'gpt-4o',
    apiKeyPrefix: 'sk-'
  },
  custom: {
    name: 'Custom Provider',
    baseUrl: 'http://localhost:8080',
    modelName: 'llama-3.1-8b'
  }
};

export const prompts = {
  mainMenu: (): ListQuestion => ({
    type: 'list',
    name: 'action',
    message: '🚀 What would you like to do?',
    choices: [
      { name: '➕ Add a new model', value: 'add' },
      { name: '✏️  Edit existing model', value: 'edit' },
      { name: '🗑️  Remove model', value: 'remove' },
      { name: '👀 View current config', value: 'view' },
      { name: '💾 Save and exit', value: 'save' },
      { name: '🚪 Exit without saving', value: 'exit' }
    ]
  }),

  providerSelection: (): ListQuestion => ({
    type: 'list',
    name: 'provider',
    message: '🔧 Select a provider:',
    choices: [
      { name: '🌐 OpenRouter', value: 'openrouter' },
      { name: '⚡ Groq', value: 'groq' },
      { name: '🤖 OpenAI', value: 'openai' },
      { name: '🔧 Custom Provider', value: 'custom' }
    ]
  }),

  modelId: (existingIds: string[] = []): InputQuestion => ({
    type: 'input',
    name: 'id',
    message: '🆔 Model ID (unique identifier):',
    validate: (input: string) => {
      const required = validators.isRequired(input);
      if (required !== true) return required;
      const unique = validators.isUniqueModelId(existingIds)(input);
      if (unique !== true) return unique;
      return validators.isValidModelId(input);
    }
  }),

  displayName: (): InputQuestion => ({
    type: 'input',
    name: 'display_name',
    message: '📝 Display name (human-readable):',
    validate: validators.isRequired
  }),

  baseUrl: (defaultUrl: string): InputQuestion => ({
    type: 'input',
    name: 'base_url',
    message: `🔗 Base URL (default: ${defaultUrl}):`,
    default: defaultUrl,
    validate: validators.isValidUrl
  }),

  apiKey: (providerName: string, defaultKey?: string): PasswordQuestion => ({
    type: 'password',
    name: 'api_key',
    message: `🔑 API key for ${providerName}:` + (defaultKey ? ' (leave empty to use existing)' : ''),
    mask: '*',
    validate: (input: string) => {
      if (defaultKey && !input) return true;
      return validators.isValidApiKey(input);
    }
  }),

  modelName: (defaultName: string): InputQuestion => ({
    type: 'input',
    name: 'model_name',
    message: `🤖 Model name (default: ${defaultName}):`,
    default: defaultName,
    validate: validators.isRequired
  }),

  maxTokens: (defaultTokens: number = 4096): InputQuestion => ({
    type: 'input',
    name: 'max_tokens',
    message: `📊 Max tokens (default: ${defaultTokens}):`,
    default: defaultTokens.toString(),
    validate: validators.isValidNumber(1, 1000000)
  }),

  temperatureRange: (defaultRange: [number, number] = [0, 2]): InputQuestion => ({
    type: 'input',
    name: 'temperature_range',
    message: `🌡️  Temperature range (min, max - default: ${defaultRange.join(', ')}):`,
    default: defaultRange.join(', '),
    validate: validators.isValidTemperatureRange
  }),

  supportsStreaming: (defaultValue: boolean = true): ConfirmQuestion => ({
    type: 'confirm',
    name: 'supports_streaming',
    message: '💬 Supports streaming?',
    default: defaultValue
  }),

  supportsTools: (defaultValue: boolean = true): ConfirmQuestion => ({
    type: 'confirm',
    name: 'supports_tools',
    message: '🛠️  Supports tools/functions?',
    default: defaultValue
  }),

  supportsVision: (defaultValue: boolean = false): ConfirmQuestion => ({
    type: 'confirm',
    name: 'supports_vision',
    message: '👁️  Supports vision (image input)?',
    default: defaultValue
  }),

  pricing: () => [{
    type: 'confirm',
    name: 'has_pricing',
    message: '💰 Add pricing information?',
    default: false
  }, {
    type: 'input',
    name: 'input_per_1k',
    message: '💵 Input price per 1K tokens (USD):',
    validate: validators.isValidPrice,
    when: (answers: any) => answers.has_pricing,
    default: '0.003'
  }, {
    type: 'input',
    name: 'output_per_1k',
    message: '💵 Output price per 1K tokens (USD):',
    validate: validators.isValidPrice,
    when: (answers: any) => answers.has_pricing,
    default: '0.015'
  }],

  editModelSelection: (models: Array<{ id: string; display_name: string }>): ListQuestion => ({
    type: 'list',
    name: 'modelId',
    message: '✏️  Select a model to edit:',
    choices: models.map(model => ({
      name: `${model.display_name} (${model.id})`,
      value: model.id
    }))
  }),

  removeModelSelection: (models: Array<{ id: string; display_name: string }>): ListQuestion => ({
    type: 'list',
    name: 'modelId',
    message: '🗑️  Select a model to remove:',
    choices: models.map(model => ({
      name: `${model.display_name} (${model.id})`,
      value: model.id
    }))
  }),

  confirmRemoval: (modelName: string): ConfirmQuestion => ({
    type: 'confirm',
    name: 'confirm',
    message: `⚠️  Are you sure you want to remove "${modelName}"?`,
    default: false
  }),

  saveChanges: (): ConfirmQuestion => ({
    type: 'confirm',
    name: 'save',
    message: '💾 Save changes to configuration file?',
    default: true
  })
};