import { SimpleBitset, GroupStore } from '../../src/core/index.mjs';

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

test('GroupStore: delete removes group from inverted index', () => {
  const store = new GroupStore({ universeSize: 1000 });
  const g1 = store.create(SimpleBitset.fromArray([10, 20], 1000));

  assert(store.belongsTo.get(10)?.has(g1.id), 'index should include group before delete');
  store.delete(g1.id);

  const candidates = store.getCandidates(SimpleBitset.fromArray([10], 1000));
  assert(!candidates.has(g1.id), 'deleted group should not appear in candidates');
  assert(!store.belongsTo.has(10), 'empty inverted index bucket should be removed');
  assert(!store.belongsTo.has(20), 'empty inverted index bucket should be removed');
});

test('GroupStore: merge updates index and removes source group', () => {
  const store = new GroupStore({ universeSize: 1000 });
  const g1 = store.create(SimpleBitset.fromArray([1, 2], 1000));
  const g2 = store.create(SimpleBitset.fromArray([2, 3], 1000));

  store.merge(g1, g2);

  assert(store.get(g2.id) === undefined, 'merged-away group must be removed from store');
  assert(g1.members.has(1) && g1.members.has(2) && g1.members.has(3), 'merged group must contain union of members');

  const cand3 = store.getCandidates(SimpleBitset.fromArray([3], 1000));
  assert(cand3.has(g1.id), 'merged group must be retrievable via new members');

  const cand2 = store.getCandidates(SimpleBitset.fromArray([2], 1000));
  assert(cand2.has(g1.id), 'merged group must still be retrievable via shared members');
  assert(!cand2.has(g2.id), 'merged-away group must not remain in index');
});

test('GroupStore: toJSON/fromJSON preserves members and index', () => {
  const store = new GroupStore({ universeSize: 1000, maxGroupsPerIdentity: 10 });
  const g1 = store.create(SimpleBitset.fromArray([7, 8], 1000));
  g1.salience = 0.7;
  const g2 = store.create(SimpleBitset.fromArray([8, 9], 1000));
  g2.usageCount = 5;

  const json = store.toJSON();
  const restored = GroupStore.fromJSON(json);
  assertEqual(restored.size, store.size);

  const restoredG1 = restored.get(g1.id);
  assert(restoredG1, 'restored store should contain group');
  assertEqual(restoredG1.salience, 0.7);

  const cand9 = restored.getCandidates(SimpleBitset.fromArray([9], 1000));
  assert(cand9.has(g2.id), 'restored index should return group candidates');
});
