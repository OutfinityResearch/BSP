import { IDFTracker } from '../../src/core/index.mjs';

test('IDFTracker: update counts unique tokens per document', () => {
  const tracker = new IDFTracker({ stopwordThreshold: 0.5 });
  tracker.update(['a', 'a', 'b']);
  tracker.update(['a', 'c']);

  assertEqual(tracker.documentCount, 2);
  assertEqual(tracker.tokenDocCounts.get('a'), 2);
  assertEqual(tracker.tokenDocCounts.get('b'), 1);
  assertEqual(tracker.tokenDocCounts.get('c'), 1);

  assertEqual(tracker.getDocFrequencyRatio('a'), 1);
  assertEqual(tracker.getDocFrequencyRatio('b'), 0.5);

  assert(tracker.isStopword('a'), 'token in >threshold docs must be stopword');
  assert(!tracker.isStopword('b'), 'token at exactly threshold must not be stopword');
});

test('IDFTracker: toJSON/fromJSON keeps frequent tokens only', () => {
  const tracker = new IDFTracker({ stopwordThreshold: 0.25 });

  for (let i = 0; i < 10; i++) {
    if (i === 0) tracker.update(['keep', 'drop']);
    else if (i === 1) tracker.update(['keep']);
    else tracker.update([`t${i}`]);
  }

  const json = tracker.toJSON();
  const restored = IDFTracker.fromJSON(json);

  assertEqual(restored.documentCount, tracker.documentCount);
  assertEqual(restored.stopwordThreshold, tracker.stopwordThreshold);

  assert(restored.tokenDocCounts.has('keep'), 'token with docCount>=2 must be serialized');
  assert(!restored.tokenDocCounts.has('drop'), 'token with docCount<2 must be pruned during serialization');
});

