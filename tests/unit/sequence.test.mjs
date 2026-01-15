import { SequenceModel } from '../../src/core/index.mjs';

test('SequenceModel: temperature controls randomness (smoke)', () => {
  const model = new SequenceModel({ smoothing: 'addAlpha', smoothingAlpha: 0.1 });
  model.learn(['the', 'cat', 'sat']);
  model.learn(['the', 'cat', 'ran']);
  model.learn(['the', 'dog', 'ran']);

  const s1 = model.generate(['the', 'cat'], { temperature: 0.2 });
  const s2 = model.generate(['the', 'cat'], { temperature: 2.0 });

  assert(s1.length > 0);
  assert(s2.length > 0);
});

test('SequenceModel: serialization roundtrip keeps smoothing', () => {
  const model = new SequenceModel({ smoothing: 'addAlpha', smoothingAlpha: 0.2 });
  model.learn(['a', 'b', 'c']);
  const json = model.toJSON();
  const restored = SequenceModel.fromJSON(json);
  assertEqual(restored.smoothing, 'addAlpha');
  assertEqual(restored.smoothingAlpha, 0.2);
});
