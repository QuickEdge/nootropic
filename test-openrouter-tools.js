import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// Test OpenRouter's tool calling with a simple example
async function testOpenRouterTools() {
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || 'your-api-key',
  });

  // Define a simple tool
  const tools = [
    {
      type: 'function',
      function: {
        name: 'getWeather',
        description: 'Get the current weather in a given location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA',
            },
            unit: {
              type: 'string',
              enum: ['celsius', 'fahrenheit'],
              description: 'The unit for temperature',
            },
          },
          required: ['location'],
        },
      },
    },
  ];

  try {
    console.log('🔧 Sending request with tool definitions...\n');
    console.log('Tools:', JSON.stringify(tools, null, 2));

    // Make the initial request
    const response = await client.chat.completions.create({
      model: 'openai/gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: 'What is the weather like in San Francisco?',
        },
      ],
      tools: tools,
      tool_choice: 'auto',
    });

    console.log('\n📨 Response:', JSON.stringify(response, null, 2));

    // Check if the model wants to use a tool
    const message = response.choices[0].message;
    if (message.tool_calls) {
      console.log('\n🛠️ Model wants to call tools:');
      for (const toolCall of message.tool_calls) {
        console.log(`- ${toolCall.function.name}(${toolCall.function.arguments})`);
        console.log(`  Tool call ID: ${toolCall.id}`);
      }

      // Simulate tool execution
      const toolResult = {
        temperature: 72,
        unit: 'fahrenheit',
        conditions: 'Sunny',
      };

      console.log('\n🌡️ Simulated tool result:', JSON.stringify(toolResult, null, 2));

      // Send the tool result back
      const finalResponse = await client.chat.completions.create({
        model: 'openai/gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: 'What is the weather like in San Francisco?',
          },
          message, // The assistant's message with tool_calls
          {
            role: 'tool',
            tool_call_id: message.tool_calls[0].id,
            content: JSON.stringify(toolResult),
          },
        ],
        tools: tools,
      });

      console.log('\n📝 Final response:', JSON.stringify(finalResponse, null, 2));
      console.log('\n✅ Assistant says:', finalResponse.choices[0].message.content);
    } else {
      console.log('\n❌ Model did not call any tools');
      console.log('Response:', message.content);
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error.response) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the test
console.log('🚀 Testing OpenRouter tool calling...\n');
testOpenRouterTools();