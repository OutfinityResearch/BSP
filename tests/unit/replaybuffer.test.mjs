import { ReplayBuffer } from '../../src/core/index.mjs';

test('ReplayBuffer: add and sample', () => {
  const buffer = new ReplayBuffer({ maxSize: 100 });
  buffer.add({ timestamp: Date.now(), inputBits: [1, 2], activeGroupIds: [1], surprise: 5, reward: 0.5, importance: 0.8 });
  buffer.add({ timestamp: Date.now(), inputBits: [3, 4], activeGroupIds: [2], surprise: 3, reward: 0.2, importance: 0.5 });
  const samples = buffer.sample(1);
  assertEqual(samples.length, 1);
});

test('ReplayBuffer: max size enforcement', () => {
  const buffer = new ReplayBuffer({ maxSize: 3 });
  for (let i = 0; i < 10; i++) {
    buffer.add({ timestamp: i, inputBits: [i], activeGroupIds: [i], surprise: i, reward: 0, importance: 0.5 });
  }
  assertEqual(buffer.size, 3);
});

test('ReplayBuffer: toJSON/fromJSON preserves priorities and episodes', () => {
  const buffer = new ReplayBuffer({ maxSize: 10, priorityExponent: 1 });
  buffer.add({ timestamp: 1, inputBits: [1], activeGroupIds: [1], surprise: 0, reward: 0, importance: 1.0 });
  buffer.add({ timestamp: 2, inputBits: [2], activeGroupIds: [2], surprise: 5, reward: 0.5, importance: 0.5 });

  const json = buffer.toJSON();
  const restored = ReplayBuffer.fromJSON(json);

  assertEqual(restored.size, buffer.size);
  assert(Math.abs(restored.totalPriority - buffer.totalPriority) < 1e-12, 'totalPriority should roundtrip');
  assertDeepEqual(restored.getRecent(2).map((e) => e.timestamp), [1, 2]);
});

test('ReplayBuffer: eviction replaces lowest priority episode', () => {
  const buffer = new ReplayBuffer({ maxSize: 2, priorityExponent: 1 });

  buffer.add({ timestamp: 1, inputBits: [1], activeGroupIds: [1], surprise: 0, reward: 0, importance: 1.0 });  // pr=1.0
  buffer.add({ timestamp: 2, inputBits: [2], activeGroupIds: [2], surprise: 0, reward: 0, importance: 0.1 });  // pr=0.1
  buffer.add({ timestamp: 3, inputBits: [3], activeGroupIds: [3], surprise: 0, reward: 0, importance: 0.9 });  // pr=0.9

  assertEqual(buffer.size, 2);
  const timestamps = buffer.buffer.map((e) => e.timestamp).sort((a, b) => a - b);
  assertDeepEqual(timestamps, [1, 3]);
});
