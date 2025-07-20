import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chatCompletionsRouter } from './routes/chat-completions';
import { errorHandler } from './middleware/error-handler';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Anthropic OpenAI Proxy Server' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/v1/chat/completions', chatCompletionsRouter);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Anthropic OpenAI Proxy listening on port ${port}`);
});