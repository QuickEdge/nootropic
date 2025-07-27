# Nootropic - Anthropic to OpenAI Proxy

A reverse proxy that accepts requests in Anthropic's API format and translates them to OpenAI-compatible API calls, allowing applications using Anthropic's API to connect to OpenAI-compatible services (OpenAI, Groq, OpenRouter, or custom endpoints).

## Features

- **Drop-in replacement**: Use with any Anthropic client library
- **Streaming support**: Real-time streaming responses with proper SSE formatting
- **Tool calling**: Full support for Anthropic's tool use format, translated to OpenAI function calling
- **Multi-modal**: Support for images (base64-encoded) and text content
- **Error handling**: Proper Anthropic-style error responses
- **Flexible routing**: Configure multiple models from different providers
- **Interactive config editor**: Built-in CLI tool for easy configuration

## Quick Start

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-org/nootropic.git
cd nootropic
```

2. Install dependencies:
```bash
npm install
```

3. Configure the proxy:
```bash
# Run the interactive configuration editor
npm run config

# Or manually create config at ~/.config/nootropic/config.toml
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
  apiKey: 'any-key', // Can be any value - actual API keys are in config
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

## Model Configuration

Models are configured in `~/.config/nootropic/config.toml`. You can:
- Configure multiple models from different providers
- Set custom model mappings
- Use models from OpenAI, Groq, OpenRouter, or any OpenAI-compatible API
- Route specific Anthropic model names to your configured models

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port (overrides config) | 3000 |
| `CONFIG_PATH` | Custom config file path | `~/.config/nootropic/config.toml` |

### Available Endpoints

- `POST /v1/messages` - Messages (Anthropic-compatible)
- `GET /v1/models` - Model listing (Anthropic-compatible)
- `GET /v1/models/:id` - Specific model details
- `GET /health` - Health check endpoint
- `GET /` - Basic info endpoint

### Configuration File

The proxy uses a TOML configuration file located at `~/.config/nootropic/config.toml`.

#### Configuration Structure

```toml
[logging]
enabled = true
level = "info"     # debug|info|warn|error
format = "text"    # json|text

[server]
port = 3000
host = "localhost"

[server.cors]
enabled = true
origins = ["*"]

[[models]]
display_name = "gpt-4o"          # Model name shown to Anthropic clients
provider = "openai"              # Provider type

[models.config]
base_url = "https://api.openai.com/v1"
api_key = "sk-your-openai-key"
model_name = "gpt-4o"            # Actual model name sent to provider
max_tokens = 128000              # Optional: override max tokens

[[models]]
display_name = "mixtral-8x7b"
provider = "groq"

[models.config]
base_url = "https://api.groq.com/openai/v1"
api_key = "your-groq-key"
model_name = "mixtral-8x7b-32768"

[defaults]
max_tokens = 4096
temperature = 0.7
stream = false

[model_routing]
default_model_display_name = "gpt-4o"
route_claude_models_to_default = true  # Route unrecognized models to default
```

#### Configuration Fields Explained

**Model Configuration:**
- `display_name`: The model identifier shown to Anthropic clients
- `provider`: Provider type (openai, groq, openrouter, custom)
- `config.base_url`: The OpenAI-compatible API endpoint
- `config.api_key`: Your API key for the provider
- `config.model_name`: The actual model name the provider expects
- `config.max_tokens`: Optional max token override

**Model Routing:**
- `default_model_display_name`: Default model when none specified
- `route_claude_models_to_default`: Route requests for Claude models to your default

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
- `npm run config` - Run interactive configuration editor
- `npm test` - Run tests
- `npm run lint` - Lint code
- `npm run typecheck` - Type checking

### Project Structure

```
src/
├── index.ts                 # Server entry point
├── routes/
│   ├── messages.ts          # Anthropic messages endpoint
│   └── models.ts            # Model listing endpoints
├── services/
│   ├── translation.ts       # Anthropic ↔ OpenAI translation
│   ├── openai.ts            # OpenAI API client
│   └── streaming-tool-state.ts # Streaming response handler
├── middleware/
│   ├── error-handler.ts     # Error handling
│   └── request-validation.ts # Request validation
├── utils/
│   ├── config.ts            # Configuration management
│   └── logger.ts            # Logging utilities
├── config-editor/
│   └── index.ts             # Interactive CLI configuration
└── types/
    └── index.ts             # TypeScript definitions
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

## Features and Limitations

### Supported Features:
- **Full message translation**: All Anthropic message formats
- **Image support**: Base64-encoded images in messages
- **Tool use**: Complete tool calling with streaming support
- **Multiple providers**: OpenAI, Groq, OpenRouter, custom endpoints
- **Flexible configuration**: Per-model settings and routing

### Current Limitations:
- **Authentication**: Ignores Anthropic x-api-key header (uses configured keys)
- **Beta features**: Some Anthropic beta features may not be fully supported
- **Token counting**: Estimated for streaming responses

## Contributing & Vibe Coding

This entire project has been developed using Claude Code, and AI-generated contributions are more than welcome! We embrace the collaborative spirit of human-AI pair programming.

### A Note on AI Development

⚠️ **Notice**: This software has been primarily developed through AI assistance. While extensively tested and functional, it represents a new paradigm in software development where AI agents handle the implementation details. As with any software, please review and test thoroughly before production use.

### How to Contribute

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Run tests: `npm test`
5. Run linting: `npm run lint`
6. Commit your changes: `git commit -am 'Add feature'`
7. Push to the branch: `git push origin feature-name`
8. Submit a pull request

Whether you're coding with Claude, GitHub Copilot, or your own fingers, all contributions are welcome after passing code review!

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

For issues and questions, please open an issue on GitHub.