const { BSPEngine } = require('../../src/core');

test('Perf smoke: process throughput is non-trivial', () => {
  const engine = new BSPEngine({ useVocab: false });
  const lines = [
    'the cat sat on the mat',
    'machine learning is a subset of artificial intelligence',
    'birds fly high in the sky above the trees',
    'data structures organize information efficiently',
  ];

  const start = Date.now();
  const iterations = 2000;
  for (let i = 0; i < iterations; i++) {
    engine.process(lines[i % lines.length], { learn: true });
  }
  const ms = Date.now() - start;
  const perSec = ms > 0 ? (iterations / (ms / 1000)) : Infinity;

  // Very conservative: this is a smoke test, not a benchmark gate.
  assert(perSec >= 200, `Throughput too low: ${perSec.toFixed(0)} it/s`);
}, { timeoutMs: 10000, tags: ['perf'] });
