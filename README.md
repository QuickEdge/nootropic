# Anthropic OpenAI Proxy

A reverse proxy that wraps the Anthropic API to conform to OpenAI's protocol, allowing you to use Anthropic Claude models as drop-in replacements for OpenAI GPT models in existing applications.

## Features

- **Drop-in replacement**: Use with any OpenAI client library
- **Streaming support**: Real-time streaming responses
- **Tool calling**: Function calling capabilities
- **Multi-modal**: Support for images and text
- **Error handling**: Proper HTTP status codes and error messages
- **Model mapping**: Automatic translation between OpenAI and Anthropic model names

## Quick Start

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-org/anthropic-openai-proxy.git
cd anthropic-openai-proxy
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env and add your Anthropic API key
```

4. Start the server:
```bash
# Development mode with hot reload
npm run dev

# Production mode
npm run build
npm start
```

The server will start on port 3000 by default.

## Usage

### Basic Usage

Use the proxy exactly like you would use the OpenAI API, but with the proxy URL:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer any-key" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ]
  }'
```

### JavaScript/Node.js

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:3000/v1',
  apiKey: 'any-key', // API key is ignored, Anthropic key is used from env
});

const completion = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [
    { role: 'user', content: 'Hello, world!' }
  ],
});

console.log(completion.choices[0].message.content);
```

### Python

```python
import openai

client = openai.OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="any-key"
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "user", "content": "Hello, world!"}
    ]
)

print(response.choices[0].message.content)
```

### Streaming

```javascript
const stream = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Tell me a story' }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

## Model Mapping

The proxy automatically maps OpenAI model names to Anthropic models:

| OpenAI Model | Anthropic Model |
|--------------|-----------------|
| gpt-4 | claude-3-opus-20240229 |
| gpt-4-turbo | claude-3-sonnet-20240229 |
| gpt-4-turbo-preview | claude-3-sonnet-20240229 |
| gpt-4o | claude-3-5-sonnet-20241022 |
| gpt-4o-mini | claude-3-haiku-20240307 |
| gpt-3.5-turbo | claude-3-haiku-20240307 |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | Required |
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment mode | development |
| `LOG_LEVEL` | Logging level | info |

### Available Endpoints

- `POST /v1/chat/completions` - Chat completions (OpenAI-compatible)
- `GET /health` - Health check endpoint
- `GET /` - Basic info endpoint

## API Examples

### Basic Chat

```json
{
  "model": "gpt-4",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "What is the capital of France?"}
  ]
}
```

### With Images

```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "user",
      "content": [
        {"type": "text", "text": "What's in this image?"},
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,/9j/4AAQ..."}}
      ]
    }
  ]
}
```

### With Tools

```json
{
  "model": "gpt-4",
  "messages": [
    {"role": "user", "content": "What's the weather in San Francisco?"}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get weather information",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {"type": "string"}
          }
        }
      }
    }
  ]
}
```

## Development

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run lint` - Lint code
- `npm run typecheck` - Type checking

### Project Structure

```
src/
├── index.ts                 # Server entry point
├── routes/
│   └── chat-completions.ts  # OpenAI-compatible endpoints
├── services/
│   ├── translation.ts       # OpenAI ↔ Anthropic translation
│   └── anthropic.ts         # Anthropic API client
├── middleware/
│   └── error-handler.ts     # Error handling
└── types/
    └── index.ts            # TypeScript definitions
```

## Error Handling

The proxy returns standard OpenAI error formats:

```json
{
  "error": {
    "message": "Invalid API key",
    "type": "invalid_request_error"
  }
}
```

Common errors:
- `400 Bad Request` - Invalid request format
- `401 Unauthorized` - Missing or invalid Anthropic API key
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

## Limitations

- **Authentication**: Uses Anthropic API key from environment, ignores OpenAI Authorization header
- **Model Selection**: Limited to pre-defined model mappings
- **Streaming**: Limited streaming event types compared to OpenAI
- **Tool Responses**: Complex tool use scenarios may have edge cases

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Run tests: `npm test`
5. Run linting: `npm run lint`
6. Commit your changes: `git commit -am 'Add feature'`
7. Push to the branch: `git push origin feature-name`
8. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

For issues and questions, please open an issue on GitHub.