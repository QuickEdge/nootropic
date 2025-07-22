import OpenAI from 'openai';

// Test to verify our tool message format is correct
async function testToolMessageFormat() {
  // Create a minimal request that mimics what we're sending
  const request = {
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'user',
        content: 'Please read the file test.txt'
      },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1234567890',
            type: 'function',
            function: {
              name: 'Read',
              arguments: '{"file_path": "test.txt"}'
            }
          }
        ]
      },
      {
        role: 'tool',
        tool_call_id: 'call_1234567890',
        content: '1→const fs = require(\'fs\');\n2→\n3→function handleLs(args) {\n4→  return new Promise((resolve) => {\n5→    exec(\'ls -F \' + args, (error, stdout, stderr) => {'
      }
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'Read',
          description: 'Read a file',
          parameters: {
            type: 'object',
            properties: {
              file_path: { type: 'string' }
            },
            required: ['file_path']
          }
        }
      }
    ]
  };

  console.log('Test request structure:');
  console.log(JSON.stringify(request, null, 2));

  // Verify the structure matches OpenAI's expected format
  console.log('\nVerifying message structure:');
  request.messages.forEach((msg, idx) => {
    console.log(`\nMessage ${idx + 1}:`);
    console.log('- Role:', msg.role);
    if (msg.role === 'tool') {
      console.log('- Tool Call ID:', msg.tool_call_id);
      console.log('- Content preview:', msg.content.substring(0, 50) + '...');
    } else if (msg.tool_calls) {
      console.log('- Has tool calls:', msg.tool_calls.length);
      msg.tool_calls.forEach(tc => {
        console.log('  - ID:', tc.id);
        console.log('  - Function:', tc.function.name);
      });
    }
  });

  // Check if the tool message content might be misinterpreted
  const toolMessage = request.messages[2];
  console.log('\nChecking for potential issues in tool content:');
  
  // Check for patterns that might be misinterpreted as tool calls
  const problematicPatterns = [
    /Read:\d+/,
    /tool<\|/,
    /\|>/,
    /<\|tool_call_begin\|>/,
    /<\|tool_call_end\|>/
  ];

  problematicPatterns.forEach(pattern => {
    if (pattern.test(toolMessage.content)) {
      console.warn('⚠️ Tool content matches problematic pattern:', pattern);
    }
  });

  // The content "Read:0" in the error might come from line numbers like "1→"
  if (toolMessage.content.includes('→')) {
    console.log('✓ Content includes line number arrows (→) which should be fine');
  }
}

testToolMessageFormat();