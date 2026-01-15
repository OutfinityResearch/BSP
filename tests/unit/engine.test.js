const { BSPEngine } = require('../../src/core');

  test('Engine: encode produces bits', () => {
  const engine = new BSPEngine();
  const bits = engine.encode('Hello world');
  assert(bits.size > 0);
});

test('Engine: process returns expected fields', () => {
  const engine = new BSPEngine();
  const result = engine.process('Testing engine');
  assert('surprise' in result);
  assert('importance' in result);
  assert('activeGroups' in result);
});

test('Engine: learn=false does not mutate training state', () => {
  const engine = new BSPEngine({ useVocab: true });
  engine.process('hello world', { learn: true });

  const before = {
    step: engine.step,
    groups: engine.store.size,
    edges: engine.graph.edgeCount,
    buffer: engine.buffer.size,
    docs: engine.idfTracker.documentCount,
    vocab: engine.tokenizer.nextVocabId,
  };

  engine.process('completely new tokens here', { learn: false });

  assertEqual(engine.step, before.step);
  assertEqual(engine.store.size, before.groups);
  assertEqual(engine.graph.edgeCount, before.edges);
  assertEqual(engine.buffer.size, before.buffer);
  assertEqual(engine.idfTracker.documentCount, before.docs);
  assertEqual(engine.tokenizer.nextVocabId, before.vocab);
});

test('Engine: subsampling does not break encoding', () => {
  const originalRandom = Math.random;
  Math.random = () => 0.0; // deterministic keep decisions
  try {
    const engine = new BSPEngine({
      useVocab: true,
      tokenizer: { subsampleHotTokens: true, subsampleT: 1e-3 }
    });

    for (let i = 0; i < 120; i++) {
      engine.process('the the the the', { learn: true });
    }

    const result = engine.process('the cat sat on the mat', { learn: true });
    assert(result.inputSize > 0);
  } finally {
    Math.random = originalRandom;
  }
});

test('Engine: toJSON/fromJSON roundtrip', () => {
  const engine = new BSPEngine();
  engine.process('Test data');
  engine.process('More test data');

  const json = engine.toJSON();
  const restored = BSPEngine.fromJSON(json);

  assertEqual(restored.step, engine.step);
  assertEqual(restored.store.size, engine.store.size);
});
