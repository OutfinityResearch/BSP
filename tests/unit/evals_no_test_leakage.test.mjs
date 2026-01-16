import { BSPEngine } from '../../src/core/index.mjs';

test('engine.process({learn:false}) does not mutate training state', async () => {
  const engine = new BSPEngine({
    universeSize: 4096,
    maxGroups: 2000,
    useVocab: true,
    tokenizerConfig: { ngramSizes: [1] },
  });

  const trainLines = [
    'a b c',
    'a b d',
    'b c d',
    'x y z',
    'x y a',
  ];
  for (const line of trainLines) {
    engine.process(line, { learn: true });
  }

  const snapshot = {
    step: engine.step,
    groupCount: engine.store.size,
    edgeCount: engine.graph.edgeCount,
    vocabSize: engine.tokenizer.vocab.size,
    docCount: engine.idfTracker.documentCount,
    bufferSize: engine.buffer.size,
  };

  const testPrompts = [
    'a b',
    'x y',
    'neverseen',
  ];

  for (const prompt of testPrompts) {
    engine.resetContext();
    engine.process(prompt, { learn: false });
  }

  assertEqual(engine.step, snapshot.step, 'step mutated during learn:false evaluation');
  assertEqual(engine.store.size, snapshot.groupCount, 'groupCount mutated during learn:false evaluation');
  assertEqual(engine.graph.edgeCount, snapshot.edgeCount, 'edgeCount mutated during learn:false evaluation');
  assertEqual(engine.tokenizer.vocab.size, snapshot.vocabSize, 'vocab size mutated during learn:false evaluation');
  assertEqual(engine.idfTracker.documentCount, snapshot.docCount, 'docCount mutated during learn:false evaluation');
  assertEqual(engine.buffer.size, snapshot.bufferSize, 'buffer size mutated during learn:false evaluation');
}, { timeoutMs: 5000 });

