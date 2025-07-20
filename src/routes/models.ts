import { Router } from 'express';
import { ConfigManager } from '../utils/config';

const router = Router();

router.get('/', (req, res) => {
  const config = ConfigManager.getInstance().getConfig();
  
  const modelsResponse = {
    data: config.models.map(model => ({
      id: model.id,
      type: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: model.provider,
      max_tokens: model.config.max_tokens,
      display_name: model.display_name,
      supports_streaming: model.config.supports_streaming,
      supports_tools: model.config.supports_tools,
      supports_vision: model.config.supports_vision,
      temperature_range: model.config.temperature_range,
      pricing: model.pricing
    })),
    object: 'list',
    has_more: false,
    first_id: config.models[0]?.id || null,
    last_id: config.models[config.models.length - 1]?.id || null
  };

  res.json(modelsResponse);
});

router.get('/:model', (req, res) => {
  const modelId = req.params.model;
  const model = ConfigManager.getInstance().getModelConfig(modelId);
  
  if (!model) {
    return res.status(404).json({
      type: 'error',
      error: {
        type: 'not_found_error',
        message: `Model ${modelId} not found`
      }
    });
  }

  const modelResponse = {
    id: model.id,
    type: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: model.provider,
    max_tokens: model.config.max_tokens,
    display_name: model.display_name,
    supports_streaming: model.config.supports_streaming,
    supports_tools: model.config.supports_tools,
    supports_vision: model.config.supports_vision,
    temperature_range: model.config.temperature_range,
    pricing: model.pricing
  };

  res.json(modelResponse);
});

export { router as modelsRouter };