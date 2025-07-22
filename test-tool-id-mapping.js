// Test script for tool ID mapping functionality
const { ToolIdMapper } = require('./dist/services/tool-id-mapper.js');

console.log('=== Tool ID Mapping Tests ===\n');

const mapper = new ToolIdMapper();

// Test 1: Basic mapping
console.log('Test 1: Basic ID Mapping');
const anthropicId1 = 'toolu_01A09q90qw90lq917835lq9';
const openAIId1 = mapper.mapAnthropicId(anthropicId1);
console.log('Anthropic ID:', anthropicId1);
console.log('Generated OpenAI ID:', openAIId1);
console.log('Reverse lookup:', mapper.mapOpenAIId(openAIId1));
console.log('Stats:', mapper.getStats());
console.log();

// Test 2: Multiple mappings
console.log('Test 2: Multiple ID Mappings');
const anthropicId2 = 'toolu_02B10a91ax91ma928a936ab0';
const anthropicId3 = 'toolu_03C21b02bx02nb039b047bc1';

const openAIId2 = mapper.mapAnthropicId(anthropicId2);
const openAIId3 = mapper.mapAnthropicId(anthropicId3);

console.log('Mapped IDs:');
console.log(`  ${anthropicId1} → ${openAIId1}`);
console.log(`  ${anthropicId2} → ${openAIId2}`);
console.log(`  ${anthropicId3} → ${openAIId3}`);
console.log();

// Test 3: Reverse mapping verification
console.log('Test 3: Reverse Mapping Verification');
console.log('OpenAI → Anthropic:');
console.log(`  ${openAIId1} → ${mapper.mapOpenAIId(openAIId1)}`);
console.log(`  ${openAIId2} → ${mapper.mapOpenAIId(openAIId2)}`);
console.log(`  ${openAIId3} → ${mapper.mapOpenAIId(openAIId3)}`);
console.log();

// Test 4: Duplicate mapping (should return existing)
console.log('Test 4: Duplicate Mapping');
const duplicateOpenAIId = mapper.mapAnthropicId(anthropicId1);
console.log('Mapping same Anthropic ID again:', duplicateOpenAIId);
console.log('Should be same as first:', openAIId1);
console.log('Are they equal?', duplicateOpenAIId === openAIId1);
console.log();

// Test 5: Missing mapping
console.log('Test 5: Missing Mapping');
const missingId = mapper.mapOpenAIId('call_nonexistent_123');
console.log('Mapping non-existent OpenAI ID:', missingId);
console.log();

// Test 6: Final stats
console.log('Test 6: Final Statistics');
console.log('Final stats:', mapper.getStats());
console.log();

// Test 7: Clear and verify
console.log('Test 7: Clear Mappings');
mapper.clear();
console.log('Stats after clear:', mapper.getStats());
console.log();

console.log('=== Tests Complete ===');