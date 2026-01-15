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
