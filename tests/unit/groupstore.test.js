const { SimpleBitset, GroupStore } = require('../../src/core');

test('GroupStore: create/get and candidates', () => {
  const store = new GroupStore();
  const g1 = store.create(SimpleBitset.fromArray([1, 2, 3], 1000));
  store.create(SimpleBitset.fromArray([4, 5, 6], 1000));

  assert(store.get(g1.id) === g1);
  const candidates = store.getCandidates(SimpleBitset.fromArray([1, 2], 1000));
  assertEqual(candidates.size, 1);
});

test('GroupStore: inverted index cap keeps best group (lowestSalience eviction)', () => {
  const store = new GroupStore({ maxGroupsPerIdentity: 1, indexEvictPolicy: 'lowestSalience' });
  const g1 = store.create(SimpleBitset.fromArray([1], 1000));
  g1.salience = 0.9;
  const g2 = store.create(SimpleBitset.fromArray([1], 1000));
  g2.salience = 0.1;

  const candidates = store.getCandidates(SimpleBitset.fromArray([1], 1000));
  assert(candidates.size <= 1);
  assert(candidates.has(g1.id));
});

