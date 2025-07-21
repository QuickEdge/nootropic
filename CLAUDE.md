# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a proxy implementation that wraps the Anthropic API to conform to the OpenAI protocol. The project starts from scratch and implements a translation layer between Anthropic's native API format and OpenAI's API format.

## Architecture & Structure

The codebase implements a reverse proxy that:
1. **Receives OpenAI-format requests** on standard OpenAI endpoints (`/v1/chat/completions`, `/v1/completions`, etc.)
2. **Translates OpenAI schema to Anthropic schema** including message format conversion, parameter mapping, and response structure adaptation
3. **Proxies requests to Anthropic's API** at `https://api.anthropic.com`
4. **Translates Anthropic responses back to OpenAI format** including streaming support, error handling, and usage reporting

## Key Components to Build

### Core Translation Layer
- **Schema Mapping**: Convert between OpenAI's schema and Anthropic's schema as defined in `specs/hosted_spec.json`
- **Message Format Conversion**: Transform OpenAI's `messages` array to Anthropic's format
- **Parameter Translation**: Map OpenAI parameters (`temperature`, `max_tokens`, etc.) to Anthropic equivalents
- **Response Formatting**: Convert Anthropic responses to OpenAI's response format

### API Endpoints to Implement
- `POST /v1/chat/completions` - Maps to Anthropic's `/v1/messages`
- `POST /v1/completions` - Maps to Anthropic's `/v1/complete` (legacy)
- Streaming support for both endpoints
- Error handling and status code translation

### Authentication & Headers
- **OpenAI-style auth**: Accept `Authorization: Bearer sk-...` headers
- **Anthropic auth**: Translate to `x-api-key` header for Anthropic
- **Header forwarding**: Handle `anthropic-version`, `anthropic-beta` headers appropriately

## Development Commands

### Setup & Installation
```bash
# Install dependencies (when package.json is created)
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Anthropic API key

# Set up configuration file
cp config.example.toml ~/.config/nootropic/config.toml
# Edit ~/.config/nootropic/config.toml with your API keys
```

### Development Server
```bash
# Start development server with hot reload
npm run dev

# Run with specific port
PORT=3000 npm run dev
```

### Testing
```bash
# Run all tests
npm test

# Run specific test file
npm test -- --testNamePattern="chat completions"

# Run tests in watch mode
npm run test:watch

# Run integration tests against actual Anthropic API
npm run test:integration
```

### Building & Production
```bash
# Build for production
npm run build

# Start production server
npm start

# Run with custom config
CONFIG_PATH=./config/production.json npm start
```

### Linting & Code Quality
```bash
# Run ESLint
npm run lint

# Fix auto-fixable lint issues
npm run lint:fix

# Type checking
npm run typecheck

# Format code
npm run format
```

## Testing Strategy

### Unit Tests
- Test individual translation functions
- Mock Anthropic API responses
- Validate request/response format conversion

### Integration Tests
- Test against actual Anthropic API (with limited usage)
- Verify end-to-end request/response flow
- Test streaming responses

### Load Testing
```bash
# Run load tests
npm run test:load

# Generate load test report
npm run test:load:report
```

## Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=your_anthropic_api_key

# Optional
PORT=3000
LOG_LEVEL=info
CACHE_TTL=3600
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60000
```

## API Schema Reference

The project uses `specs/hosted_spec.json` as the authoritative source for:
- Anthropic API schema definitions
- Request/response formats
- Available models and parameters
- Error response structures

## Common Development Tasks

### Adding New Model Support
1. Update model mapping in translation layer
2. Add tests for new model parameters
3. Update OpenAPI documentation

### Handling New Anthropic Features
1. Check `specs/hosted_spec.json` for new endpoints
2. Implement translation logic in appropriate module
3. Add comprehensive tests
4. Update documentation

### Debugging Translation Issues
```bash
# Enable debug logging
DEBUG=anthropic-proxy:* npm run dev

# Log raw requests/responses
DEBUG=anthropic-proxy:request,anthropic-proxy:response npm run dev
```

## Performance Considerations
- Implement request/response caching where appropriate
- Use streaming for large responses
- Handle rate limiting gracefully with exponential backoff
- Monitor token usage and costs

## Security Notes
- Never log API keys or sensitive request data
- Implement proper request validation
- Use HTTPS in production
- Consider implementing request signing for additional security

## Development Best Practices
- When finishing a task, run the linter and fix any warnings before considering it complete