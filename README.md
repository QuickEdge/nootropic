# OpenAI Anthropic Proxy

A reverse proxy that wraps the OpenAI API to conform to Anthropic's protocol, allowing you to use OpenAI GPT models as drop-in replacements for Anthropic Claude models in existing applications.

## Features

- **Drop-in replacement**: Use with any Anthropic client library
- **Streaming support**: Real-time streaming responses
- **Tool calling**: Function calling capabilities
- **Multi-modal**: Support for images and text
- **Error handling**: Proper HTTP status codes and error messages
- **Model mapping**: Automatic translation between Anthropic and OpenAI model names

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
# Edit .env and add your OpenAI API key
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

Use the proxy exactly like you would use the Anthropic API, but with the proxy URL:

```bash
curl -X POST http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: any-key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ]
  }'
```

### JavaScript/Node.js

```javascript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  baseURL: 'http://localhost:3000',
  apiKey: 'any-key', // API key is ignored, OpenAI key is used from env
});

const message = await anthropic.messages.create({
  model: 'claude-3-sonnet-20240229',
  max_tokens: 1024,
  messages: [
    { role: 'user', content: 'Hello, world!' }
  ],
});

console.log(message.content[0].text);
```

### Python

```python
import anthropic

client = anthropic.Anthropic(
    base_url="http://localhost:3000",
    api_key="any-key"
)

message = client.messages.create(
    model="claude-3-sonnet-20240229",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Hello, world!"}
    ]
)

print(message.content[0].text)
```

### Streaming

```javascript
const stream = await anthropic.messages.create({
  model: 'claude-3-sonnet-20240229',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Tell me a story' }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.delta?.text || '');
}
```

## Model Mapping

The proxy automatically maps Anthropic model names to OpenAI models:

| Anthropic Model | OpenAI Model |
|-----------------|--------------|
| claude-3-opus-20240229 | gpt-4 |
| claude-3-sonnet-20240229 | gpt-4-turbo |
| claude-3-5-sonnet-20241022 | gpt-4o |
| claude-3-haiku-20240307 | gpt-4o-mini |
| claude-3-haiku-20240307 | gpt-3.5-turbo |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | Your OpenAI API key | Required |
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment mode | development |
| `LOG_LEVEL` | Logging level | info |

### Available Endpoints

- `POST /v1/messages` - Messages (Anthropic-compatible)
- `GET /health` - Health check endpoint
- `GET /` - Basic info endpoint

## API Examples

### Basic Chat

```json
{
  "model": "claude-3-sonnet-20240229",
  "max_tokens": 1024,
  "messages": [
    {"role": "user", "content": "What is the capital of France?"}
  ]
}
```

### With System Prompt

```json
{
  "model": "claude-3-sonnet-20240229",
  "max_tokens": 1024,
  "system": "You are a helpful assistant.",
  "messages": [
    {"role": "user", "content": "What is the capital of France?"}
  ]
}
```

### With Images

```json
{
  "model": "claude-3-sonnet-20240229",
  "max_tokens": 1024,
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": "/9j/4AAQ..."
          }
        },
        {
          "type": "text",
          "text": "What's in this image?"
        }
      ]
    }
  ]
}
```

### With Tools

```json
{
  "model": "claude-3-sonnet-20240229",
  "max_tokens": 1024,
  "messages": [
    {"role": "user", "content": "What's the weather in San Francisco?"}
  ],
  "tools": [
    {
      "name": "get_weather",
      "description": "Get weather information",
      "input_schema": {
        "type": "object",
        "properties": {
          "location": {"type": "string"}
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
│   └── messages.ts          # Anthropic-compatible endpoints
├── services/
│   ├── translation.ts       # Anthropic ↔ OpenAI translation
│   └── openai.ts            # OpenAI API client
├── middleware/
│   └── error-handler.ts     # Error handling
└── types/
    └── index.ts            # TypeScript definitions
```

## Error Handling

The proxy returns standard Anthropic error formats:

```json
{
  "type": "error",
  "error": {
    "type": "authentication_error",
    "message": "Invalid API key"
  }
}
```

Common errors:
- `400 Bad Request` - Invalid request format
- `401 Unauthorized` - Missing or invalid OpenAI API key
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

## Limitations

- **Authentication**: Uses OpenAI API key from environment, ignores Anthropic x-api-key header
- **Model Selection**: Limited to pre-defined model mappings
- **Streaming**: Limited streaming event types compared to Anthropic
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