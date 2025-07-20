import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { messagesRouter } from './routes/messages';
import { errorHandler } from './middleware/error-handler';

dotenv.config();

const app = express();
const port = process.env.NOOTROPIC_PORT || process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'OpenAI Anthropic Proxy Server' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/v1/messages', messagesRouter);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`OpenAI Anthropic Proxy listening on port ${port}`);
});