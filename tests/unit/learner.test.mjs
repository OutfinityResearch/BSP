import { SimpleBitset, GroupStore, Learner } from '../../src/core/index.mjs';

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

test('Learner: updateMemberships keeps GroupStore index consistent', () => {
  const store = new GroupStore({ universeSize: 64 });
  const group = store.create(SimpleBitset.fromArray([10, 20], 64));

  const learner = new Learner({
    membershipThreshold: 2,
    alpha: 2,       // promotes new members immediately
    alphaDecay: 2,  // removes hallucinated members immediately
  });

  const input = SimpleBitset.fromArray([30], 64);
  const hallucination = SimpleBitset.fromArray([10], 64);

  learner.updateMemberships([group], input, hallucination, 1.0, store);

  assert(group.members.has(30), 'new input identity should be added to members');
  assert(store.belongsTo.get(30)?.has(group.id), 'inverted index should include new identity');

  assert(!group.members.has(10), 'hallucinated identity should be removed from members');
  assert(!store.belongsTo.has(10), 'inverted index should not keep empty buckets');
});
