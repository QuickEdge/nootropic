import express from 'express';
import cors from 'cors';
import { messagesRouter } from './routes/messages';
import { modelsRouter } from './routes/models';
import { errorHandler } from './middleware/error-handler';
import { ConfigManager } from './utils/config';
import Logger from './utils/logger';

const configManager = ConfigManager.getInstance();
const config = configManager.getConfig();

// Check if any models are configured
if (!config.models || config.models.length === 0) {
  Logger.error('No models configured!');
  Logger.error('Please configure at least one model to run the proxy service.');
  Logger.error('Use the interactive config editor to add models: npm run config');
  Logger.error(`Or add models manually to your config file at: ${configManager.getConfigPath()}`);
  process.exit(1);
}

const app = express();
const port = config.server.port;

if (config.server.cors.enabled) {
  app.use(cors({
    origin: config.server.cors.origins
  }));
}
app.use(express.json({ 
  limit: '50mb' // Handle large requests like claude-code-router (52MB)
}));

app.get('/', (req, res) => {
  res.json({ message: 'OpenAI Anthropic Proxy Server', version: '1.0.0' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use('/v1/messages', messagesRouter);
app.use('/v1/models', modelsRouter);

app.use(errorHandler);

app.listen(port, config.server.host, () => {
  Logger.info(`OpenAI Anthropic Proxy listening on ${config.server.host}:${port}`);
  Logger.info(`Configured models: ${config.models.length}`);
  const defaultModelId = ConfigManager.getInstance().getDefaultModel();
  Logger.info(`Default model: ${defaultModelId || 'none'}`);
  
  if (config.models.length > 0) {
    Logger.info('Available models:', {
      models: config.models.map(model => {
        const isDefault = model.display_name === defaultModelId;
        return `${model.display_name}${isDefault ? ' [DEFAULT]' : ''}`;
      })
    });
  }
});