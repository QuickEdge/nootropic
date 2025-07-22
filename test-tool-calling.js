// Test script for tool calling functionality
// This script tests the Anthropic-to-OpenAI proxy with tool calling

const PROXY_URL = 'http://localhost:3000';

// Example of a simple weather tool
const weatherTool = {
  name: 'get_weather',
  description: 'Get the current weather in a given location',
  input_schema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The city and state, e.g. San Francisco, CA'
      }
    },
    required: ['location']
  }
};

// Test 1: Simple tool call
async function testSimpleToolCall() {
  console.log('\n=== Test 1: Simple Tool Call ===');
  
  const response = await fetch(`${PROXY_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || 'test-key',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: "What's the weather in San Francisco?"
        }
      ],
      tools: [weatherTool]
    })
  });

  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));
  
  // Check if tool was called
  const hasToolCall = data.content?.some(block => block.type === 'tool_use');
  console.log('Tool was called:', hasToolCall);
  
  return data;
}

// Test 2: Multi-turn conversation with tool results
async function testMultiTurnToolCall() {
  console.log('\n=== Test 2: Multi-turn Tool Call ===');
  
  // First call - get tool use
  const firstResponse = await testSimpleToolCall();
  
  // Extract tool use block
  const toolUseBlock = firstResponse.content?.find(block => block.type === 'tool_use');
  
  if (!toolUseBlock) {
    console.log('No tool use block found in first response');
    return;
  }
  
  // Second call - send tool result
  const response = await fetch(`${PROXY_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || 'test-key',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: "What's the weather in San Francisco?"
        },
        {
          role: 'assistant',
          content: firstResponse.content
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseBlock.id,
              content: 'The weather in San Francisco is 68°F and partly cloudy.'
            }
          ]
        }
      ],
      tools: [weatherTool]
    })
  });

  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));
}

// Test 3: Multiple tools in one request
async function testMultipleTools() {
  console.log('\n=== Test 3: Multiple Tools ===');
  
  const calculatorTool = {
    name: 'calculator',
    description: 'Evaluate mathematical expressions',
    input_schema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to evaluate'
        }
      },
      required: ['expression']
    }
  };
  
  const response = await fetch(`${PROXY_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || 'test-key',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: "What's the weather in San Francisco and what's 25 * 4?"
        }
      ],
      tools: [weatherTool, calculatorTool]
    })
  });

  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));
  
  // Check how many tools were called
  const toolCalls = data.content?.filter(block => block.type === 'tool_use') || [];
  console.log('Number of tool calls:', toolCalls.length);
  console.log('Tools called:', toolCalls.map(tc => tc.name));
}

// Run tests
async function runTests() {
  try {
    await testSimpleToolCall();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay between tests
    
    await testMultiTurnToolCall();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testMultipleTools();
  } catch (error) {
    console.error('Test error:', error);
  }
}

// Check if proxy is running
fetch(`${PROXY_URL}/health`)
  .then(() => {
    console.log('Proxy is running, starting tests...');
    runTests();
  })
  .catch(() => {
    console.log('Proxy is not running. Please start it with: npm run dev');
  });