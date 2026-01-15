/**
 * BSP Test Script
 * Run basic tests for all components
 */

const { SimpleBitset, Tokenizer, GroupStore, DeductionGraph, Learner, ReplayBuffer, BPCMEngine } = require('../src/core');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

console.log('='.repeat(60));
console.log('BSP Test Suite');
console.log('='.repeat(60));

// SimpleBitset tests
console.log('\nSimpleBitset:');

test('add and has', () => {
  const bs = new SimpleBitset(1000);
  bs.add(42);
  bs.add(100);
  assert(bs.has(42), 'should have 42');
  assert(bs.has(100), 'should have 100');
  assert(!bs.has(50), 'should not have 50');
});

test('size (popcount)', () => {
  const bs = new SimpleBitset(1000);
  bs.add(1);
  bs.add(2);
  bs.add(3);
  assert(bs.size === 3, 'size should be 3');
});

test('remove', () => {
  const bs = new SimpleBitset(1000);
  bs.add(10);
  bs.remove(10);
  assert(!bs.has(10), 'should not have 10 after remove');
});

test('and (intersection)', () => {
  const a = SimpleBitset.fromArray([1, 2, 3, 4]);
  const b = SimpleBitset.fromArray([3, 4, 5, 6]);
  const c = a.and(b);
  assert(c.size === 2, 'intersection should have 2 elements');
  assert(c.has(3) && c.has(4), 'should have 3 and 4');
});

test('or (union)', () => {
  const a = SimpleBitset.fromArray([1, 2]);
  const b = SimpleBitset.fromArray([3, 4]);
  const c = a.or(b);
  assert(c.size === 4, 'union should have 4 elements');
});

test('andNot (difference)', () => {
  const a = SimpleBitset.fromArray([1, 2, 3]);
  const b = SimpleBitset.fromArray([2, 3, 4]);
  const c = a.andNot(b);
  assert(c.size === 1, 'difference should have 1 element');
  assert(c.has(1), 'should have 1');
});

test('toJSON and fromJSON', () => {
  const a = SimpleBitset.fromArray([10, 20, 30]);
  const json = a.toJSON();
  const b = SimpleBitset.fromJSON(json);
  assert(b.size === 3, 'restored should have 3 elements');
  assert(b.has(10) && b.has(20) && b.has(30), 'should have same elements');
});

// Tokenizer tests
console.log('\nTokenizer:');

test('tokenize words', () => {
  const tok = new Tokenizer();
  const words = tok.tokenizeWords('Hello World');
  assert(words.length === 2, 'should have 2 words');
  assert(words[0] === 'hello', 'should lowercase');
});

test('encode to IDs', () => {
  const tok = new Tokenizer({ universeSize: 1000 });
  const ids = tok.encode('The cat sat on the mat');
  assert(ids.length > 0, 'should produce IDs');
  assert(ids.every(id => id >= 0 && id < 1000), 'IDs should be in range');
});

test('generate ngrams', () => {
  const tok = new Tokenizer({ ngramMin: 1, ngramMax: 2 });
  const ngrams = tok.generateNgrams(['a', 'b', 'c']);
  assert(ngrams.includes('a'), 'should have unigrams');
  assert(ngrams.includes('a_b'), 'should have bigrams');
});

// GroupStore tests
console.log('\nGroupStore:');

test('create group', () => {
  const store = new GroupStore();
  const members = SimpleBitset.fromArray([1, 2, 3]);
  const group = store.create(members);
  assert(group.id !== undefined, 'should have ID');
  assert(group.members.size === 3, 'should have 3 members');
});

test('get group', () => {
  const store = new GroupStore();
  const members = SimpleBitset.fromArray([1, 2]);
  const created = store.create(members);
  const retrieved = store.get(created.id);
  assert(retrieved === created, 'should retrieve same group');
});

test('get candidates', () => {
  const store = new GroupStore();
  store.create(SimpleBitset.fromArray([1, 2, 3]));
  store.create(SimpleBitset.fromArray([4, 5, 6]));
  
  const input = SimpleBitset.fromArray([1, 2]);
  const candidates = store.getCandidates(input);
  assert(candidates.size === 1, 'should find 1 candidate');
});

// DeductionGraph tests
console.log('\nDeductionGraph:');

test('strengthen edge', () => {
  const graph = new DeductionGraph();
  graph.strengthen(1, 2, 0.5);
  graph.strengthen(1, 2, 0.5);
  const deductions = graph.getDeductions(1);
  assert(deductions.get(2) === 1.0, 'weight should be 1.0');
});

test('predict direct', () => {
  const graph = new DeductionGraph();
  graph.strengthen(1, 2, 1.0);
  graph.strengthen(1, 3, 0.5);
  const predictions = graph.predictDirect([1]);
  assert(predictions.size === 2, 'should predict 2 groups');
});

test('predict multi-hop', () => {
  const graph = new DeductionGraph();
  graph.strengthen(1, 2, 1.0);
  graph.strengthen(2, 3, 1.0);
  const predictions = graph.predictMultiHop([1], { maxDepth: 2 });
  assert(predictions.has(3), 'should reach 3 via multi-hop');
});

// Learner tests
console.log('\nLearner:');

test('compute importance', () => {
  const learner = new Learner();
  const imp = learner.computeImportance({ novelty: 0.5, utility: 0.5, stability: 0.5 });
  assert(imp >= 0.1 && imp <= 1.0, 'importance should be in range');
});

test('compute score', () => {
  const learner = new Learner();
  const group = {
    members: SimpleBitset.fromArray([1, 2, 3]),
    memberCounts: new Map(),
    salience: 0.5,
  };
  const input = SimpleBitset.fromArray([1, 2]);
  const score = learner.computeScore(group, input);
  assert(score > 0, 'score should be positive');
});

// ReplayBuffer tests
console.log('\nReplayBuffer:');

test('add and sample', () => {
  const buffer = new ReplayBuffer({ maxSize: 100 });
  buffer.add({ timestamp: Date.now(), inputBits: [1, 2], activeGroupIds: [1], surprise: 5, reward: 0.5, importance: 0.8 });
  buffer.add({ timestamp: Date.now(), inputBits: [3, 4], activeGroupIds: [2], surprise: 3, reward: 0.2, importance: 0.5 });
  const samples = buffer.sample(1);
  assert(samples.length === 1, 'should sample 1');
});

test('max size enforcement', () => {
  const buffer = new ReplayBuffer({ maxSize: 3 });
  for (let i = 0; i < 10; i++) {
    buffer.add({ timestamp: i, inputBits: [i], activeGroupIds: [i], surprise: i, reward: 0, importance: 0.5 });
  }
  assert(buffer.size === 3, 'should not exceed max size');
});

// BPCMEngine tests
console.log('\nBPCMEngine:');

test('encode text', () => {
  const engine = new BPCMEngine();
  const bits = engine.encode('Hello world');
  assert(bits.size > 0, 'should produce bits');
});

test('process creates groups', () => {
  const engine = new BPCMEngine();
  
  // Process several times to trigger group creation
  for (let i = 0; i < 10; i++) {
    engine.process('The cat sat on the mat');
  }
  
  assert(engine.store.size > 0, 'should create groups');
});

test('process returns metrics', () => {
  const engine = new BPCMEngine();
  const result = engine.process('Testing BSP engine');
  assert('surprise' in result, 'should have surprise');
  assert('importance' in result, 'should have importance');
  assert('activeGroups' in result, 'should have activeGroups');
});

test('toJSON and fromJSON', () => {
  const engine = new BPCMEngine();
  engine.process('Test data');
  engine.process('More test data');
  
  const json = engine.toJSON();
  const restored = BPCMEngine.fromJSON(json);
  
  assert(restored.step === engine.step, 'step should match');
  assert(restored.store.size === engine.store.size, 'store size should match');
});

test('RL pressure affects learning', () => {
  const engine = new BPCMEngine();
  engine.setRLPressure(0.8);
  assert(engine.rlPressure === 0.8, 'RL pressure should be set');
});

test('predict next', () => {
  const engine = new BPCMEngine();
  
  // Train with sequential data
  engine.process('The cat');
  engine.process('sat on');
  engine.process('the mat');
  
  const predictions = engine.predictNext(engine.context, 5);
  assert(Array.isArray(predictions), 'should return array');
});

// Summary
console.log('\n' + '='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
}
