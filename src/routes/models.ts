import { Router } from 'express';
import { ConfigManager } from '../utils/config';

const router = Router();

router.get('/', (req, res) => {
  const config = ConfigManager.getInstance().getConfig();
  
  const modelsResponse = {
    data: config.models.map(model => ({
      created_at: new Date().toISOString(),
      display_name: model.display_name,
      id: model.id,
      type: 'model' as const
    })),
    first_id: config.models[0]?.id || null,
    has_more: false,
    last_id: config.models[config.models.length - 1]?.id || null
  };

  res.json(modelsResponse);
});

router.get('/default', (req, res) => {
  const configManager = ConfigManager.getInstance();
  const defaultModelId = configManager.getDefaultModel();
  
  if (!defaultModelId) {
    return res.status(404).json({
      type: 'error',
      error: {
        type: 'not_found_error',
        message: 'No default model configured'
      }
    });
  }
  
  const model = configManager.getModelConfig(defaultModelId);
  
  if (!model) {
    return res.status(404).json({
      type: 'error',
      error: {
        type: 'not_found_error',
        message: `Default model ${defaultModelId} not found`
      }
    });
  }

  const modelResponse = {
    created_at: new Date().toISOString(),
    display_name: model.display_name,
    id: model.id,
    type: 'model' as const
  };

  res.json(modelResponse);
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
    created_at: new Date().toISOString(),
    display_name: model.display_name,
    id: model.id,
    type: 'model' as const
  };

  res.json(modelResponse);
});

export { router as modelsRouter };