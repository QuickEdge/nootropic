import express from 'express';
import cors from 'cors';
import { messagesRouter } from './routes/messages';
import { modelsRouter } from './routes/models';
import { errorHandler } from './middleware/error-handler';
import { ConfigManager } from './utils/config';

const configManager = ConfigManager.getInstance();
const config = configManager.getConfig();

// Check if any models are configured
if (!config.models || config.models.length === 0) {
  console.error('\n❌ No models configured!');
  console.error('\n📝 Please configure at least one model to run the proxy service.');
  console.error('\n💡 Use the interactive config editor to add models:');
  console.error('   npm run config');
  console.error('\n🆘 Or add models manually to your config file at:');
  console.error(`   ${configManager.getConfigPath()}`);
  process.exit(1);
}

const app = express();
const port = config.server.port;

if (config.server.cors.enabled) {
  app.use(cors({
    origin: config.server.cors.origins
  }));
}
app.use(express.json());

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
  console.log(`\n🚀 OpenAI Anthropic Proxy listening on ${config.server.host}:${port}`);
  console.log(`📊 Configured models: ${config.models.length}`);
  console.log(`🔧 Default model: ${config.defaults.model || 'none'}`);
  
  if (config.models.length > 0) {
    console.log('\n📋 Available models:');
    config.models.forEach(model => {
      console.log(`   - ${model.id} (${model.display_name})`);
    });
  }
});