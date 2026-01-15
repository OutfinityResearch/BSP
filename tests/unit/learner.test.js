const { SimpleBitset, Learner } = require('../../src/core');

test('Learner: computeImportance stays in [0.1, 1.0]', () => {
  const learner = new Learner();
  const imp = learner.computeImportance({ novelty: 0.5, utility: 0.5, stability: 0.5 });
  assert(imp >= 0.1 && imp <= 1.0);
});

test('Learner: computeScore is positive for overlapping group', () => {
  const learner = new Learner();
  const group = {
    members: SimpleBitset.fromArray([1, 2, 3], 1000),
    memberCounts: new Map(),
    salience: 0.5,
  };
  const input = SimpleBitset.fromArray([1, 2], 1000);
  const score = learner.computeScore(group, input);
  assert(score > 0);
});

