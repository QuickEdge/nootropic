// Test script for hybrid tool ID handling
const { ToolIdMapper } = require('./dist/services/tool-id-mapper.js');

console.log('=== Hybrid Tool ID Mapping Tests ===\n');

const mapper = new ToolIdMapper();

// Test 1: Regular mapped IDs (proxy flow)
console.log('Test 1: Regular Proxy Flow (Mapped IDs)');
const regularId = 'toolu_01A09q90qw90lq917835lq9';
const openAIId = mapper.mapAnthropicId(regularId);
console.log(`Created mapping: ${regularId} → ${openAIId}`);

const result1 = mapper.getOrCreateOpenAIId(regularId);
console.log('getOrCreateOpenAIId result:', result1);
console.log();

// Test 2: Claude Code internal tool IDs (unmapped)
console.log('Test 2: Claude Code Internal Tools (Unmapped IDs)');

const testCases = [
  'functions.Glob:1',
  'functions.Read:23', 
  'functions.Write:0',
  'Read:45',
  'Edit:7',
  '0',
  '123',
  'functions.LS',
  'some-random-id'
];

testCases.forEach(anthropicId => {
  const result = mapper.getOrCreateOpenAIId(anthropicId);
  console.log(`${anthropicId} → ${result.openaiId} (${result.wasFound ? 'found' : 'generated'})`);
});

console.log();

// Test 3: Consistency - same unmapped ID should get same OpenAI ID
console.log('Test 3: Consistency Check');
const testId = 'functions.Glob:5';
const first = mapper.getOrCreateOpenAIId(testId);
const second = mapper.getOrCreateOpenAIId(testId);

console.log(`First call: ${testId} → ${first.openaiId} (${first.wasFound ? 'found' : 'generated'})`);
console.log(`Second call: ${testId} → ${second.openaiId} (${second.wasFound ? 'found' : 'generated'})`);
console.log(`Consistent? ${first.openaiId === second.openaiId}`);
console.log();

// Test 4: Reverse mapping should work for generated IDs
console.log('Test 4: Reverse Mapping');
const unmappedId = 'functions.MultiEdit:99';
const { openaiId: generatedId } = mapper.getOrCreateOpenAIId(unmappedId);
const reverseMapped = mapper.getAnthropicId(generatedId);

console.log(`Original: ${unmappedId}`);
console.log(`Generated OpenAI ID: ${generatedId}`);  
console.log(`Reverse mapped: ${reverseMapped}`);
console.log(`Round-trip success? ${reverseMapped === unmappedId}`);
console.log();

// Test 5: Final stats
console.log('Test 5: Final Statistics');
const stats = mapper.getStats();
console.log('Mapping stats:', stats);
console.log();

// Test 6: Edge cases
console.log('Test 6: Edge Cases');
const edgeCases = [
  'functions.Tool-With-Dashes:1',
  'functions.Tool With Spaces:2',
  'tool/with/slashes:3',
  'tool@with@symbols:4',
  ''
];

edgeCases.forEach(id => {
  try {
    const result = mapper.getOrCreateOpenAIId(id);
    console.log(`"${id}" → "${result.openaiId}" (${result.wasFound ? 'found' : 'generated'})`);
  } catch (error) {
    console.log(`"${id}" → ERROR: ${error.message}`);
  }
});

console.log('\n=== Test Complete ===');