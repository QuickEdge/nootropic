import express from 'express';
import cors from 'cors';
import { messagesRouter } from './routes/messages';
import { modelsRouter } from './routes/models';
import { errorHandler } from './middleware/error-handler';
import { ConfigManager } from './utils/config';

const config = ConfigManager.getInstance().getConfig();

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
  console.log(`OpenAI Anthropic Proxy listening on ${config.server.host}:${port}`);
});