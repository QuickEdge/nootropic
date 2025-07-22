// Test script for streaming tool call accumulation
const { StreamingToolCallState } = require('./dist/services/streaming-tool-state.js');

console.log('=== Streaming Tool Call Accumulation Tests ===\n');

// Simulate the problematic OpenAI streaming chunks from your log
const mockChunks = [
  // Tool call start with partial arguments
  {
    id: "gen-1753181413-tjFpSKeu6BrZycrbkKh2",
    object: "chat.completion.chunk",
    choices: [{
      index: 0,
      delta: {
        role: "assistant",
        content: null,
        tool_calls: [{
          index: 0,
          id: "call_12345",
          function: {
            name: "read_file",
            arguments: " \""
          },
          type: "function"
        }]
      }
    }]
  },
  // Argument fragments  
  {
    id: "gen-1753181413-tjFpSKeu6BrZycrbkKh2",
    object: "chat.completion.chunk",
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{
          index: 0,
          function: {
            arguments: "/"
          }
        }]
      }
    }]
  },
  {
    id: "gen-1753181413-tjFpSKeu6BrZycrbkKh2", 
    object: "chat.completion.chunk",
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{
          index: 0,
          function: {
            arguments: "home"
          }
        }]
      }
    }]
  },
  {
    id: "gen-1753181413-tjFpSKeu6BrZycrbkKh2",
    object: "chat.completion.chunk", 
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{
          index: 0,
          function: {
            arguments: "/user/file.txt\""
          }
        }]
      }
    }]
  },
  {
    id: "gen-1753181413-tjFpSKeu6BrZycrbkKh2",
    object: "chat.completion.chunk",
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{
          index: 0,
          function: {
            arguments: "}"
          }
        }]
      }
    }]
  },
  // Completion chunk
  {
    id: "gen-1753181413-tjFpSKeu6BrZycrbkKh2",
    object: "chat.completion.chunk",
    choices: [{
      index: 0,
      delta: {},
      finish_reason: "tool_calls"
    }]
  }
];

const toolState = new StreamingToolCallState('test-session');

console.log('Processing streaming chunks...\n');

let eventCount = 0;
for (const chunk of mockChunks) {
  console.log(`--- Chunk ${++eventCount} ---`);
  console.log('Input chunk delta:', JSON.stringify(chunk.choices[0]?.delta || {}, null, 2));
  
  const events = toolState.processChunk(chunk);
  
  console.log(`Generated ${events.length} Anthropic events:`);
  events.forEach((event, i) => {
    console.log(`  Event ${i + 1}: ${event.type}`);
    if (event.type === 'content_block_start') {
      console.log(`    Tool: ${event.content_block.name} (ID: ${event.content_block.id})`);
    } else if (event.type === 'content_block_delta') {
      console.log(`    Delta: "${event.delta.partial_json}"`);
    }
  });
  
  console.log('State stats:', toolState.getStats());
  console.log();
}

console.log('=== Final Results ===');
console.log('Final accumulated arguments:');
console.log('Tool 0:', toolState.getAccumulatedArguments(0));
console.log('Final stats:', toolState.getStats());
console.log();

console.log('=== Expected vs Actual ===');
console.log('Expected final arguments: {"path": "/home/user/file.txt"}'); 
console.log('Actual accumulated:', toolState.getAccumulatedArguments(0));
console.log('Match?', toolState.getAccumulatedArguments(0) === ' "/home/user/file.txt"}');

console.log('\n=== Test Complete ===');