// Test script for JSON parsing functionality
// This script tests the robust JSON parsing for concatenated objects

// Simulate the parsing logic (simplified version for testing)
function parseMultipleJSONObjects(jsonString) {
  const objects = [];
  let braceCount = 0;
  let start = 0;
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          // Found complete object
          const objStr = jsonString.slice(start, i + 1).trim();
          if (objStr) {
            objects.push(JSON.parse(objStr));
          }
          start = i + 1;
        }
      }
    }
  }
  
  return objects.length === 1 ? objects[0] : objects;
}

function safeParseToolArguments(argumentsString) {
  try {
    // Try normal parsing first
    return JSON.parse(argumentsString);
  } catch (error) {
    console.warn('🔄 Standard JSON parse failed, trying multiple object parsing');
    try {
      return parseMultipleJSONObjects(argumentsString);
    } catch (multiError) {
      console.error('❌ All parsing strategies failed:', {
        original: error.message,
        multiple: multiError.message,
        arguments: argumentsString
      });
      
      // Last resort: return raw string
      return { 
        raw_arguments: argumentsString, 
        parse_error: error.message 
      };
    }
  }
}

// Test cases
console.log('=== JSON Parsing Tests ===\n');

// Test 1: Normal JSON
console.log('Test 1: Normal JSON');
const test1 = '{"query": "normal search"}';
console.log('Input:', test1);
console.log('Output:', JSON.stringify(safeParseToolArguments(test1), null, 2));
console.log();

// Test 2: Concatenated JSON objects
console.log('Test 2: Concatenated JSON objects');
const test2 = '{"query": "search1"}{"query": "search2"}';
console.log('Input:', test2);
console.log('Output:', JSON.stringify(safeParseToolArguments(test2), null, 2));
console.log();

// Test 3: Multiple objects with strings containing braces
console.log('Test 3: Complex concatenated objects');
const test3 = '{"message": "Hello {world}"}{"data": {"nested": true}}';
console.log('Input:', test3);
console.log('Output:', JSON.stringify(safeParseToolArguments(test3), null, 2));
console.log();

// Test 4: Invalid JSON
console.log('Test 4: Invalid JSON');
const test4 = '{"invalid": json}';
console.log('Input:', test4);
console.log('Output:', JSON.stringify(safeParseToolArguments(test4), null, 2));
console.log();

// Test 5: Empty object
console.log('Test 5: Empty object');
const test5 = '{}';
console.log('Input:', test5);
console.log('Output:', JSON.stringify(safeParseToolArguments(test5), null, 2));
console.log();

// Test 6: Three concatenated objects
console.log('Test 6: Three concatenated objects');
const test6 = '{"a": 1}{"b": 2}{"c": 3}';
console.log('Input:', test6);
console.log('Output:', JSON.stringify(safeParseToolArguments(test6), null, 2));
console.log();

console.log('=== Tests Complete ===');